from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import traceback
from core.algorithms import (
    run_log_detection, run_adaptive_detection, run_watershed_detection,
    run_line_detection, run_optimization, generate_lane_profiles
)

app = Flask(__name__)
CORS(app)

STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)

@app.route('/api/detect/log', methods=['POST'])
def detect_log():
    try:
        data = request.get_json()
        spots, bg_val = run_log_detection(data['image'], data.get('bg_rect'), **data)
        return jsonify({'spots': spots, 'count': len(spots), 'bg_val': bg_val})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/detect/adaptive', methods=['POST'])
def detect_adaptive():
    try:
        data = request.get_json()
        spots, bg_val = run_adaptive_detection(data['image'], data.get('bg_rect'), **data)
        return jsonify({'spots': spots, 'count': len(spots), 'bg_val': bg_val})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/detect/watershed', methods=['POST'])
def detect_watershed():
    try:
        data = request.get_json()
        spots, bg_val = run_watershed_detection(data['image'], data.get('bg_rect'), **data)
        return jsonify({'spots': spots, 'count': len(spots), 'bg_val': bg_val})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/detect/lines', methods=['POST'])
def detect_lines():
    try:
        data = request.get_json()
        lines = run_line_detection(data['image'], data.get('bg_rect'))
        return jsonify({'lines': lines})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/detect/optimize', methods=['POST'])
def detect_optimize():
    try:
        data = request.get_json()
        spots, params = run_optimization(
            data['image'], 
            model_type=data.get('model', 'adaptive'),
            plate_boxes=data.get('plate_boxes', []),
            bg_rect=data.get('bg_rect')
        )
        return jsonify({'spots': spots, 'params': params, 'count': len(spots)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate_profiles', methods=['POST'])
def generate_profiles():
    try:
        data = request.get_json()
        results = generate_lane_profiles(data['image'], data.get('lanes', []), **data)
        return jsonify({'results': results})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5050))
    app.run(host='0.0.0.0', port=port, debug=False)
