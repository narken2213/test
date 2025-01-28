document.addEventListener('DOMContentLoaded', () => {
    // Генерация UUID
    function generateUUID() {
        var d = new Date().getTime();
        var d2 = (performance && performance.now && (performance.now()*1000)) || 0;
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16;
            if(d > 0){
                r = (d + r)%16 | 0;
                d = Math.floor(d/16);
            } else {
                r = (d2 + r)%16 | 0;
                d2 = Math.floor(d2/16);
            }
            return (c==='x' ? r : (r&0x3|0x8)).toString(16);
        });
    }

    let unique_id = localStorage.getItem('unique_id');
    if (!unique_id) {
        unique_id = generateUUID();
        localStorage.setItem('unique_id', unique_id);
    }

    const socket = io();

    const qrButton = document.getElementById('qr-button');
    const messagesDiv = document.getElementById('messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('file-input');
    const uploadStatus = document.getElementById('upload-status');
    const typingStatus = document.getElementById('typing-status');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const currentPageElement = document.getElementById('current-page');
    const totalPagesElement = document.getElementById('total-pages');
    const viewer = document.getElementById('pdf-viewer');

    let typing = false;
    let timeout = undefined;
    let currentUsername = 'You'; // Изначально
    let pdfDoc = null;
    let currentPage = 1;
    let totalPages = 0;

    // Привязка обработчиков событий кнопок через JavaScript
    if (prevPageButton && nextPageButton) {
        prevPageButton.addEventListener('click', prevPage);
        nextPageButton.addEventListener('click', nextPage);
    }

    if (qrButton) {
        qrButton.addEventListener('click', () => {
            window.location.href = '/qr';
        });
    }

    // Обработка отправки сообщения
    if (sendButton && chatInput) {
        sendButton.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            } else {
                typingEvent();
            }
        });

        chatInput.addEventListener('input', () => {
            typingEvent();
        });
    }

    function sendMessage() {
        if (!chatInput) return;
        const message = chatInput.value.trim();
        if (message !== '') {
            socket.emit('send_message', { message });
            chatInput.value = '';
            socket.emit('stop_typing');
            typing = false;
        }
    }

    function typingEvent() {
        if (!typing && chatInput) {
            typing = true;
            socket.emit('typing');
            timeout = setTimeout(stopTyping, 3000);
        } else if (chatInput) {
            clearTimeout(timeout);
            timeout = setTimeout(stopTyping, 3000);
        }
    }

    function stopTyping() {
        typing = false;
        socket.emit('stop_typing');
    }

    // Получение новых сообщений
    socket.on('receive_message', (data) => {
        addMessageToChat(data.username, data.message);
    });

    // Загрузка истории сообщений при подключении
    socket.on('load_messages', (data) => {
        data.messages.forEach(msg => {
            addMessageToChat(msg.username, msg.message);
        });
    });

    // Получение собственного имени пользователя
    socket.on('your_username', (data) => {
        currentUsername = data.username;
        addSystemMessage(`Вы присоединились к чату как ${currentUsername}.`);
    });

    // Пользователь подключился
    socket.on('user_joined', (data) => {
        addSystemMessage(`${data.username} присоединился к чату.`);
    });

    // Пользователь отключился
    socket.on('user_left', (data) => {
        addSystemMessage(`${data.username} покинул чат.`);
    });

    // Пользователь начал печатать
    socket.on('user_typing', (data) => {
        showTypingStatus(`${data.username} печатает...`);
    });

    // Пользователь перестал печатать
    socket.on('user_stop_typing', (data) => {
        removeTypingStatus();
    });

    function addMessageToChat(username, message) {
        if (!messagesDiv) return;
        const messageElement = document.createElement('div');

        if (username === currentUsername) {
            messageElement.classList.add('message', 'user');
        } else {
            messageElement.classList.add('message', 'other');
        }

        // Создаём элемент для имени пользователя
        const usernameElement = document.createElement('span');
        usernameElement.classList.add('username');
        usernameElement.textContent = username;

        // Создаём элемент для текста сообщения
        const messageText = document.createElement('span');
        messageText.textContent = message;

        messageElement.appendChild(usernameElement);
        messageElement.appendChild(messageText);
        messagesDiv.appendChild(messageElement);

        // Автопрокрутка, только если пользователь находится внизу
        if (messagesDiv.scrollHeight - messagesDiv.scrollTop === messagesDiv.clientHeight) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }

    function addSystemMessage(message) {
        if (!messagesDiv) return;
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'system');

        const messageText = document.createElement('span');
        messageText.textContent = message;

        messageElement.appendChild(messageText);
        messagesDiv.appendChild(messageElement);

        // Автопрокрутка
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function showTypingStatus(message) {
        if (!typingStatus) return;
        typingStatus.textContent = message;
    }

    function removeTypingStatus() {
        if (!typingStatus) return;
        typingStatus.textContent = '';
    }

    // Обработка загрузки файла
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file) {
                uploadFile(file);
            }
        });
    }

    function uploadFile(file) {
        if (file.type !== 'application/pdf') {
            alert('Разрешены только PDF-файлы.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        if (uploadStatus) {
            uploadStatus.textContent = 'Загрузка...';
            uploadStatus.style.color = 'black';
        }
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (uploadStatus) {
                if (data.error) {
                    uploadStatus.style.color = 'red';
                    uploadStatus.textContent = data.error;
                } else {
                    uploadStatus.style.color = 'green';
                    uploadStatus.textContent = data.success;
                    loadPresentation(data.file_url);
                }
            }
        })
        .catch(err => {
            if (uploadStatus) {
                uploadStatus.style.color = 'red';
                uploadStatus.textContent = 'Ошибка при загрузке файла.';
            }
            console.error(err);
        });
    }

    // PDF.js инициализация
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

    function loadPresentation(fileURL) {
        const loadingTask = pdfjsLib.getDocument(fileURL);
        loadingTask.promise.then(function(pdf) {
            pdfDoc = pdf;
            totalPages = pdf.numPages;
            if (totalPagesElement) {
                totalPagesElement.textContent = totalPages;
            }
            currentPage = 1;
            renderPage(currentPage);
        }, function(reason) {
            console.error(reason);
            alert('Ошибка при загрузке PDF: ' + reason);
        });
    }

    function renderPage(pageNum) {
        if (!pdfDoc || !viewer) return;
        pdfDoc.getPage(pageNum).then(function(page) {
            const viewport = page.getViewport({ scale: getScaleToFit(page) });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            page.render(renderContext).promise.then(function() {
                viewer.innerHTML = '';
                viewer.appendChild(canvas);
                if (currentPageElement) {
                    currentPageElement.textContent = pageNum;
                }
                updateNavigationButtons();
            });
        });
    }

    function getScaleToFit(page) {
        if (!viewer) return 1;
        const viewerWidth = viewer.clientWidth;
        const viewerHeight = viewer.clientHeight;
        const viewport = page.getViewport({ scale: 1 });
        return Math.min(viewerWidth / viewport.width, viewerHeight / viewport.height);
    }

    function prevPage() {
        if (currentPage <= 1) {
            alert('Вы на первой странице.');
            return;
        }
        currentPage--;
        renderPage(currentPage);
    }

    function nextPage() {
        if (currentPage >= totalPages) {
            alert('Вы на последней странице.');
            return;
        }
        currentPage++;
        renderPage(currentPage);
    }

    function updateNavigationButtons() {
        if (prevPageButton && nextPageButton) {
            prevPageButton.disabled = currentPage <= 1;
            nextPageButton.disabled = currentPage >= totalPages;
        }
    }

    // Изначально отключить кнопки навигации
    updateNavigationButtons();

    // Аутентификация пользователя после подключения
    socket.on('connect', () => {
        socket.emit('authenticate', { unique_id: unique_id });
    });
});
