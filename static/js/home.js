document.getElementById('session-form').addEventListener('submit', function(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;

    // Отправляем запрос на создание сессии
    fetch('/create_session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Генерация QR-кода
            const qrCodeDiv = document.getElementById('qr-code');
            qrCodeDiv.innerHTML = ''; // Очищаем предыдущий QR-код
            new QRCode(qrCodeDiv, {
                text: data.session_url,
                width: 200,
                height: 200,
            });

            // Перенаправляем пользователя на страницу чата
            window.location.href = data.session_url;
        } else {
            alert('Ошибка при создании сессии');
        }
    });
});