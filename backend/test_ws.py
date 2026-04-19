import asyncio
import websockets
import json

async def test_ws():
    uri = "ws://localhost:8000/ws/audio"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket")
            # Send a test message
            await websocket.send(json.dumps({"text": "Start"}))
            print("Sent 'Start'")

            # Wait for response (should get 'processing' or nothing if empty audio buffer)
            # The server logic: on "Start", clears buffer. No immediate response unless audio sent later.
            
            # Let's verify connection stays open for 2 seconds
            await asyncio.sleep(2)
            print("Connection maintained")

    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_ws())
