# Keep the retained Hugging Face/Flask fallback on the same supported Python
# minor version used for the Streamlit candidate and pinned dependencies.
FROM python:3.11-slim
WORKDIR /app
COPY requirements-legacy.txt .
RUN pip install --no-cache-dir -r requirements-legacy.txt
COPY . .
# HF spaces pass the PORT environment variable to the docker container.
# It defaults to 7860.
ENV PORT=7860
EXPOSE 7860
CMD ["python", "server.py"]
