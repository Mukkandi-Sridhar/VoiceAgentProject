import asyncio
import random

class MockAIService:
    async def process_audio(self, audio_data: bytes) -> str:
        # Simulate processing time
        await asyncio.sleep(1)
        responses = [
            "Namaste! I am Kishore. How can I assist you today?",
            "That is a profound question. Let me think about it from my perspective.",
            "I am listening intently. Go on.",
            "As Kishore, I believe technology should accept us, not just understand us.",
            "I'm here, ready to chat. The interface is looking vibrant!"
        ]
        return random.choice(responses)

    async def generate_audio(self, text: str) -> bytes:
        # In a real app, this would be MP3 data from OpenAI/ElevenLabs
        # Here we just return dummy bytes or maybe a silence frame
        return b'\x00' * 1024
