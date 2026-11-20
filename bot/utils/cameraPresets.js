export const PRESETS = {
    hikvision: (ip, port = 554, user = 'admin', pass = '') =>
        `rtsp://${user}:${pass}@${ip}:${port}/Streaming/Channels/101`,
    dahua: (ip, port = 554, user = 'admin', pass = '') =>
        `rtsp://${user}:${pass}@${ip}:${port}/cam/realmonitor?channel=1&subtype=0`,
    reolink: (ip, port = 554, user = 'admin', pass = '') =>
        `rtsp://${user}:${pass}@${ip}:${port}/h264Preview_01_main`,
    xmeye: (ip, port = 554, user = 'admin', pass = '') =>
        `rtsp://${user}:${pass}@${ip}:${port}/user=${user}_password=${pass}_channel=1_stream=0.sdp`,
    generic: (ip, port = 554, user = 'admin', pass = '') =>
        `rtsp://${user}:${pass}@${ip}:${port}/live/ch0`
}

export function parseCameraInput(input) {
    if (!input || typeof input !== 'string') return ''
    const text = input.trim()

    // Прямой RTSP / RTMP / HTTP поток или ffmpeg команда
    if (/^(rtsp|rtsps|rtmp|http|https):\/\//i.test(text) || text.startsWith('ffmpeg')) {
        return text
    }

    // Упрощенный ввод: IP Логин Пароль [Бренд] [Порт]
    // Например: 192.168.1.50 admin 12345 hikvision
    const parts = text.split(/\s+/)
    if (parts.length >= 3) {
        const ip = parts[0]
        const user = parts[1]
        const pass = parts[2]
        const brand = (parts[3] || 'generic').toLowerCase()
        const port = parts[4] || 554
        const builder = PRESETS[brand] || PRESETS.generic
        return builder(ip, port, user, pass)
    }

    return text
}
