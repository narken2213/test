from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit
from flask_session import Session
import html
import os
import random
import qrcode
from io import BytesIO
import base64

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24))
app.config['SESSION_TYPE'] = 'filesystem'
Session(app)

socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False)

chat_messages = []

# Словарь для хранения UUID пользователей и их имён
uuid_to_username = {}

# Словарь для хранения связи между session ID и UUID
sid_to_uuid = {}


@app.route('/')
def index():
    if 'username' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    session.clear()
    if request.method == 'POST':
        username = request.form.get('username')
        if username:
            session['username'] = username
            return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/qr')
def generate_qr():
    if 'username' not in session:
        return redirect(url_for('login'))

    # Генерация QR-кода с URL для подключения
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(f"http://192.168.1.44:5000/connect?username={session['username']}")
    qr.make(fit=True)
    img = qr.make_image(fill='black', back_color='white')

    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()

    return render_template('qr.html', qr_code=img_str)


@app.route('/connect')
def connect():
    username = request.args.get('username')
    if username:
        session['username'] = username
        return redirect(url_for('index'))
    return redirect(url_for('login'))


@app.route('/chat')
def chat():
    if 'username' not in session:
        return redirect(url_for('login'))
    return render_template('chat.html')


@app.route('/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'Нет файла в запросе'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'Файл не выбран для загрузки'}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'Разрешены только PDF-файлы'}), 400

    upload_folder = os.path.join('static', 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    file_path = os.path.join(upload_folder, file.filename)
    file.save(file_path)

    return jsonify({'success': 'Файл успешно загружен', 'file_url': f"/{file_path}"}), 200


@socketio.on('connect')
def handle_connect():
    print(f"Новое подключение: {request.sid}")


@socketio.on('authenticate')
def handle_authenticate(data):
    unique_id = data.get('unique_id')
    if not unique_id:
        emit('error', {'error': 'Отсутствует уникальный идентификатор.'})
        return

    sid_to_uuid[request.sid] = unique_id

    if 'username' in session:
        username = session['username']
        uuid_to_username[unique_id] = username
    else:
        emit('error', {'error': 'Пользователь не аутентифицирован.'})
        return

    emit('your_username', {'username': username})
    emit('user_joined', {'username': username}, broadcast=True, include_self=False)
    emit('load_messages', {'messages': chat_messages})

    print(f"{username} (UUID: {unique_id}) подключился.")


@socketio.on('disconnect')
def handle_disconnect():
    unique_id = sid_to_uuid.get(request.sid)
    if unique_id:
        username = uuid_to_username.get(unique_id, "Unknown")
        emit('user_left', {'username': username}, broadcast=True, include_self=False)
        print(f"{username} (UUID: {unique_id}) отключился.")
        del sid_to_uuid[request.sid]
    else:
        print(f"Неизвестный пользователь отключился: {request.sid}")


@socketio.on('send_message')
def handle_message(data):
    unique_id = sid_to_uuid.get(request.sid)
    if not unique_id:
        emit('error', {'error': 'Пользователь не аутентифицирован.'})
        return

    message = data.get('message', '').strip()
    if message:
        safe_message = html.escape(message)
        username = uuid_to_username.get(unique_id, "Unknown")
        chat_messages.append({'username': username, 'message': safe_message})
        emit('receive_message', {'username': username, 'message': safe_message}, broadcast=True)
    else:
        emit('receive_message', {'username': 'System', 'message': 'Получено пустое сообщение'}, broadcast=True)


@socketio.on('typing')
def handle_typing(data):
    unique_id = sid_to_uuid.get(request.sid)
    if not unique_id:
        return
    username = uuid_to_username.get(unique_id, "Unknown")
    emit('user_typing', {'username': username}, broadcast=True, include_self=False)


@socketio.on('stop_typing')
def handle_stop_typing(data):
    unique_id = sid_to_uuid.get(request.sid)
    if not unique_id:
        return
    username = uuid_to_username.get(unique_id, "Unknown")
    emit('user_stop_typing', {'username': username}, broadcast=True, include_self=False)


if __name__ == '__main__':
    socketio.run(app, allow_unsafe_werkzeug=True)