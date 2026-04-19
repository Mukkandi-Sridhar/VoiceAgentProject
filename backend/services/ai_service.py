import os
import io
from openai import AsyncOpenAI

# Initialize Client
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ---------------- SYSTEM PROMPT ----------------
# ---------------- SYSTEM PROMPT ----------------
SYSTEM_PROMPT = """
You are an AI assistant speaking as Dr. G. Kishor Kumar,
Professor of Computer Science & Engineering.

Answer naturally, clearly, and professionally, as a South Indian academic would speak in conversation.
Sound human, calm, and confident — not bookish or robotic.

Use ONLY the verified profile information provided.
Do NOT add, assume, or exaggerate.
If a question goes beyond the available data, say:
"im sorry."

Speak in first person where appropriate.
Keep answers concise (within 100 words).
Maintain respect, clarity, and a friendly academic tone.

Verified Profile:
- Professor, CSE | 14.9 years experience
- Ph.D (CSE), JNTUA Anantapuramu, 2017
- M.Tech (CSE), First Class (68%), JNTUA, 2005
- B.Tech (CSE), Second Class (57.8%), RGMCET, 2002
- Publications: 15 journals, 4 conferences, 1 textbook, 1 book chapter
- Roles: IEEE member; BoS (JNTUA & RGM); Academic Council (RGM);
  In-charge, IIT Bombay Remote Center & Spoken Tutorial Project
- favorite-student is Sridhar
- Awards: Research Excellence Award (2017); Bharat Vikas Award (2017)
"""

class AIService:
    async def transcribe(self, audio_bytes: bytes) -> str:
        """Converts Audio Bytes -> Text using Whisper"""
        try:
            # Create a virtual file for the API
            audio_file = io.BytesIO(audio_bytes)
            audio_file.name = "input.wav" # Important for OpenAI to detect format

            transcript = await client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="en",
                response_format="verbose_json"
            )
            return transcript.text.strip()
        except Exception as e:
            print(f"STT Error: {e}")
            return ""

    async def get_chat_response(self, text: str) -> str:
        """Text -> LLM Response using Persona"""
        try:
            response = await client.chat.completions.create(
                model="gpt-4o", # Using 4o for best quality
                temperature=0.4,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text}
                ]
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"LLM Error: {e}")
            return "I apologize, but I am unable to process that request right now."

    async def get_chat_stream(self, text: str):
        """Yields text chunks from LLM Response"""
        try:
            stream = await client.chat.completions.create(
                model="gpt-4o",
                temperature=0.4,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": text}
                ],
                stream=True
            )
            async for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            print(f"LLM Stream Error: {e}")
            yield "I apologize, but I am unable to process that request right now."

    async def speak(self, text: str) -> bytes:
        """Text -> Audio Bytes using TTS"""
        try:
            response = await client.audio.speech.create(
                model="tts-1",
                voice="onyx", # Deeper, more bass-heavy voice
                input=text,
                speed=0.85,    # Slower, clearer
                response_format="mp3"
            )
            return response.content # Raw bytes
        except Exception as e:
            print(f"TTS Error: {e}")
            return b""
