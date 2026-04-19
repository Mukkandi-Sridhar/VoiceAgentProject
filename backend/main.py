import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import uvicorn

# Load environment variables
load_dotenv()

app = FastAPI(title="Speech-to-Speech Agent")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Voice Agent Backend is Running"}

@app.websocket("/ws/audio")
async def audio_websocket(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to WebSocket")
    
    from services.ai_service import AIService
    ai_service = AIService()
    
    # Buffer to hold audio chunks until "EndOfSpeech"
    audio_buffer = bytearray()
    
    try:
        while True:
            # Receive message (text or bytes)
            # websocket.receive() returns dict like {"type": "websocket.receive", "text": ..., "bytes": ...}
            # using receive() is lower level, receive_text/bytes is easier but we have mixed types.
            # Let's use receive() to handle both.
            
            message = await websocket.receive()
            
            if "bytes" in message and message["bytes"]:
                # Append audio chunk
                audio_buffer.extend(message["bytes"])
                
            if "text" in message and message["text"]:
                text_data = message["text"]
                
                # Check for control signals
                if "Start" in text_data:
                    print("Session Started")
                    audio_buffer = bytearray()
                    continue

                if "EndOfSpeech" in text_data:
                    print(f"Processing {len(audio_buffer)} bytes of audio...")
                    
                    if len(audio_buffer) == 0:
                        continue
                        
                    # 1. Processing Status
                    await websocket.send_text('{"status": "processing"}')
                    
                    # 2. STT
                    transcript = await ai_service.transcribe(bytes(audio_buffer))
                    print(f"Transcript: {transcript}")
                    await websocket.send_text(f'{{"text": "{transcript}", "sender": "user"}}')
                    
                    # Clear buffer immediately to be ready for next turn
                    audio_buffer = bytearray()
                    
                    if not transcript:
                        await websocket.send_text('{"status": "idle"}')
                        continue

                    # 3. Streaming LLM & TTS
                    print("Starting stream...")
                    full_response = ""
                    sentence_buffer = ""
                    
                    # Regex for sentence splitting (simple approximation)
                    import re
                    
                    async for chunk in ai_service.get_chat_stream(transcript):
                        if not chunk: continue
                        
                        sentence_buffer += chunk
                        full_response += chunk
                        
                        # Check for sentence delimiters
                        # Improved Buffering: Only split if we have a decent chunk (>60 chars) to avoid choppy "short sentence" audio,
                        # unless the buffer is getting dangerously long (>250 chars).
                        has_punctuation = re.search(r'[.!?](?:\s|$)', sentence_buffer)
                        is_long_enough = len(sentence_buffer) > 60
                        is_too_long = len(sentence_buffer) > 250

                        if (has_punctuation and is_long_enough) or is_too_long:
                            # Try to find the last valid punctuation
                            # Look for [.!?] followed by space, but NOT preceded by known abbreviations
                            
                            # Find all potential split points
                            split_candidates = list(re.finditer(r'([.!?])(?:\s|$)', sentence_buffer))
                            
                            valid_split_end = -1
                            
                            for match in split_candidates:
                                end_idx = match.end()
                                punct_idx = match.start()
                                
                                # data before punctuation
                                prefix = sentence_buffer[:punct_idx]
                                # Get the last word before punctuation
                                last_word_match = re.search(r'(\S+)\s*$', prefix)
                                
                                is_abbreviation = False
                                if last_word_match:
                                    last_word = last_word_match.group(1).lower().strip('(').strip(')').replace('.', '')
                                    # Common abbreviations list (normalized)
                                    abbrevs = ['dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'phd', 'al', 'et', 'ex', 'vs', 'etc']
                                    if last_word in abbrevs:
                                        is_abbreviation = True
                                
                                if not is_abbreviation:
                                    valid_split_end = end_idx
                                    break
                            
                            if valid_split_end != -1:
                                complete_sentence = sentence_buffer[:valid_split_end]
                                remainder = sentence_buffer[valid_split_end:]
                                
                                buffer_text = complete_sentence 
                                
                                if buffer_text.strip():
                                    print(f"Speaking: {buffer_text.strip()}")
                                    # Escape quotes if needed
                                    clean_text = buffer_text.replace('"', '\\"').replace('\n', ' ')
                                    await websocket.send_text(f'{{"text": "{clean_text}", "sender": "ai"}}')
                                    
                                    audio_chunk = await ai_service.speak(buffer_text)
                                    if audio_chunk:
                                        await websocket.send_text('{"status": "speaking"}')
                                        await websocket.send_bytes(audio_chunk)
                                
                                sentence_buffer = remainder

                    # Process any remaining text
                    # Process any remaining text
                    if sentence_buffer.strip():
                        print(f"Speaking Final: {sentence_buffer}")
                        clean_text = sentence_buffer.replace('"', '\\"').replace('\n', ' ')
                        await websocket.send_text(f'{{"text": "{clean_text}", "sender": "ai"}}')
                        audio_chunk = await ai_service.speak(sentence_buffer)
                        if audio_chunk:
                            await websocket.send_text('{"status": "speaking"}')
                            await websocket.send_bytes(audio_chunk)
                    
                    print(f"Full Response: {full_response}")
                    # Note: We rely on the frontend queue to set status to 'idle' when done playing
                    # But we can also send a final signal if needed. 
                    # The frontend sets idle when queue is empty, so we don't strictly need to send it here immediately,
                    # but it's good practice to ensure backend considers it done.
                    # However, if we send 'idle' now, frontend might flicker if queue is still playing.
                    # Frontend logic: audio.onended -> if queue empty -> idle.
                    # So we DON'T send 'idle' here, we let the frontend handle it when playback finishes.

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
