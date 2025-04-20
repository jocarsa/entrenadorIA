import os
import json
import threading
from flask import Flask, render_template, request, jsonify
import torch
from transformers import GPT2Tokenizer, GPT2LMHeadModel, Trainer, TrainingArguments
from torch.utils.data import Dataset

app = Flask(__name__)

# Global variables to track training state
training_in_progress = False
training_status = "Not started"
training_progress = 0
training_logs = []

# Dataset class for training
class GPTChatDataset(Dataset):
    def __init__(self, data, tokenizer, max_length=512):
        self.examples = []
        for convo in data:
            dialogue = "<inicio>\n"
            for turn in convo["conversation"]:
                prefix = "<usuario> " if turn["role"] == "user" else "<asistente> "
                dialogue += prefix + turn["content"].strip() + "\n"
            dialogue += "<fin>"
            encodings = tokenizer(
                dialogue,
                truncation=True,
                max_length=max_length,
                padding="max_length",
                return_tensors="pt"
            )
            self.examples.append({
                "input_ids":      encodings["input_ids"].squeeze(),
                "attention_mask": encodings["attention_mask"].squeeze(),
                "labels":         encodings["input_ids"].squeeze()
            })

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        return self.examples[idx]

# Special tokens for the model
SPECIAL_TOKENS = {
    "additional_special_tokens": ["<usuario>", "<asistente>", "<inicio>", "<fin>"]
}

# Paths
DATA_DIR  = "data"
DATA_FILE = os.path.join(DATA_DIR, "chat_data_openai.json")
MODEL_DIR = "./gpt2-chatbot"

# Ensure data folder & file exist
os.makedirs(DATA_DIR, exist_ok=True)
if not os.path.exists(DATA_FILE):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump([], f, ensure_ascii=False, indent=2)

# Custom Trainer that updates our globals for progress reporting
class ProgressTracker(Trainer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # make sure we never divide by zero
        self.total_steps     = max(1, self.state.max_steps)
        self.completed_steps = 0

    def training_step(self, *args, **kwargs):
        global training_progress, training_logs

        loss = super().training_step(*args, **kwargs)

        # update progress
        self.completed_steps += 1
        pct = int(100 * self.completed_steps / self.total_steps)
        training_progress = min(100, pct)

        if self.completed_steps % 10 == 0:
            training_logs.append(
                f"Step {self.completed_steps}/{self.total_steps}: Loss = {loss.item():.4f}"
            )

        return loss

def train_model():
    global training_in_progress, training_status, training_progress, training_logs

    training_in_progress = True
    training_status      = "Initializing training..."
    training_logs        = []
    training_progress    = 0

    try:
        # load dataset
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not data:
            training_status = "Failed: No training data available"
            return

        # load model & tokenizer
        training_status = "Loading model and tokenizer..."
        model_name = "gpt2"
        tokenizer = GPT2Tokenizer.from_pretrained(model_name)
        tokenizer.add_special_tokens(SPECIAL_TOKENS)
        tokenizer.pad_token = tokenizer.eos_token

        model = GPT2LMHeadModel.from_pretrained(model_name)
        model.resize_token_embeddings(len(tokenizer))

        # prepare dataset
        training_status = "Preparing dataset..."
        dataset = GPTChatDataset(data, tokenizer)

        # training args
        training_status = "Setting up training parameters..."
        training_args = TrainingArguments(
            output_dir=MODEL_DIR,
            num_train_epochs=30,
            per_device_train_batch_size=2,
            save_steps=100,
            save_total_limit=2,
            logging_steps=10,
            learning_rate=5e-5,
            weight_decay=0.01,
            fp16=torch.cuda.is_available(),
            prediction_loss_only=True
        )

        # start trainer
        training_status = "Starting training..."
        trainer = ProgressTracker(
            model=model,
            args=training_args,
            train_dataset=dataset
        )
        trainer.train()

        # save
        training_status = "Saving model..."
        model.save_pretrained(MODEL_DIR)
        tokenizer.save_pretrained(MODEL_DIR)
        training_status = "Training completed successfully!"

    except Exception as e:
        training_status = f"Training failed: {str(e)}"
        training_logs.append(f"Error: {str(e)}")
    finally:
        training_in_progress = False

def generate_response(input_text):
    try:
        if not os.path.exists(os.path.join(MODEL_DIR, "config.json")):
            return "Error: Model not trained yet. Please train the model first."

        tokenizer = GPT2Tokenizer.from_pretrained(MODEL_DIR)
        model     = GPT2LMHeadModel.from_pretrained(MODEL_DIR)
        tokenizer.pad_token = tokenizer.eos_token
        model.eval()

        prompt = f"<inicio>\n<usuario> {input_text}\n<asistente> "
        input_ids = tokenizer.encode(prompt, return_tensors="pt", truncation=True, max_length=512)

        with torch.no_grad():
            output = model.generate(
                input_ids,
                max_length=512,
                pad_token_id=tokenizer.eos_token_id,
                do_sample=True,
                top_k=50,
                top_p=0.9,
                temperature=0.8,
                num_return_sequences=1
            )

        text = tokenizer.decode(output[0], skip_special_tokens=True)
        reply = text.split("<asistente>")[-1].split("<usuario>")[0].strip()
        return reply

    except Exception as e:
        return f"Error generating response: {str(e)}"

# ——— Routes ——————————————————————————————————————————————————————————————————

@app.route('/')
def index():
    return render_template('index.html')

# Dataset CRUD
@app.route('/api/dataset', methods=['GET'])
def get_dataset():
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/dataset', methods=['POST'])
def add_conversation():
    try:
        new_convo = request.json
        with open(DATA_FILE, 'r+', encoding='utf-8') as f:
            data = json.load(f)
            data.append(new_convo)
            f.seek(0); f.truncate()
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({"message": "Conversation added successfully", "id": len(data)-1})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/dataset/<int:conversation_id>', methods=['PUT'])
def update_conversation(conversation_id):
    try:
        updated = request.json
        with open(DATA_FILE, 'r+', encoding='utf-8') as f:
            data = json.load(f)
            if conversation_id < 0 or conversation_id >= len(data):
                return jsonify({"error": "Conversation not found"}), 404
            data[conversation_id] = updated
            f.seek(0); f.truncate()
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({"message": "Conversation updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/dataset/<int:conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    try:
        with open(DATA_FILE, 'r+', encoding='utf-8') as f:
            data = json.load(f)
            if conversation_id < 0 or conversation_id >= len(data):
                return jsonify({"error": "Conversation not found"}), 404
            data.pop(conversation_id)
            f.seek(0); f.truncate()
            json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({"message": "Conversation deleted successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Training control
@app.route('/api/train', methods=['POST'])
def start_training():
    global training_in_progress
    if training_in_progress:
        return jsonify({"error": "Training already in progress"}), 400

    thread = threading.Thread(target=train_model, daemon=True)
    thread.start()
    return jsonify({"message": "Training started"})

@app.route('/api/training-status', methods=['GET'])
def get_training_status():
    return jsonify({
        "inProgress": training_in_progress,
        "status":     training_status,
        "progress":   training_progress,
        "logs":       training_logs
    })

# Chat testing
@app.route('/api/test', methods=['POST'])
def test_model():
    text = request.json.get('input')
    if not text:
        return jsonify({"error": "No input provided"}), 400
    return jsonify({"response": generate_response(text)})

if __name__ == "__main__":
    app.run(debug=True)

