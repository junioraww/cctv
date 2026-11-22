import React, { useMemo, useState, useEffect, useRef } from 'react'
import styles from '../styles'

const quotes = [
  [
    "❝Чем дальше от понедельника, тем добрее утро.❞",
    "❝Мне известно, что понедельник начинается в субботу.❞",
    "❝— Мне не встать. Понедельник наступил.... прямо на меня.❞",
  ],
  [
    "❝Ну а какая разница — вторник или пятница? Когда навстречу тебе улыбаются!❞",
    "❝Ни что так не портит пятницу, как осознание того, что сегодня вторник❞",
    "❝Вторник — для новостей.❞",
    "❝In coffee, there seems to be a new trend every Tuesday❞",
  ],
  [
    "❝Время делает шаг… вторник убивает среда.❞",
    "❝Среда непременно должна быть цветочной, с лёгким привкусом шоколада и поцелуев.❞",
    "❝Среда пришла — неделя прошла.❞",
    "❝Среда длиннее пятницы❞",
  ],
  [
    "❝Если вы четвертый день не высыпаетесь, значит, сегодня четверг!❞",
    "❝Хорошо, что завтра пятница, а не после завтра, как вчера.❞",
    "❝После дождичка в четверг обычно бывает дождичек в пятницу.❞",
    "❝Четверг рыбный день - пойду раздам лещей.❞",
  ],
  [
    "❝Пятница хоть и не большой праздник, зато постоянный❞",
    "❝Чувствуете? Выходными пахнет!❞",
    "❝Friday is my second favorite F word.❞",
    "❝Пятница! Время создавать истории, о которых вы будете вспоминать в понедельник.❞",
  ],
  [
    "❝Суббота — день отдыха для души и тела.❞",
    "❝Saturday is for adventures, Sundays are for cuddling.❞",
    "❝Суббота — день для спа. Расслабься, побалуй себя, наслаждайся и люби себя.❞",
    "❝Субботний вечер идеален для писателей, потому что все остальные развлекаются.❞",
  ],
  [
    "❝Воскресенье должно приходить с кнопкой паузы.❞",
    "❝Sunday clears away the rust of the whole week.❞",
    "❝Воскресенье — золотой замок, скрепляющий книгу недели.❞",
  ]
]

export default function Dashboard({ users, cameras }) {
  const now = Date.now() / 1000
  
  const quote = useMemo(() => {
      const dayQuotes = quotes[(new Date().getDay() + 6) % 7]
      return dayQuotes[Math.floor(Math.random() * dayQuotes.length)]
  }, [])
  
  const activeUsers = useMemo(() => {
      return (users || []).filter(u => !u.expiresAt || new Date(u.expiresAt) > new Date())
  }, [ users ])

  const recent10m = activeUsers.filter(u => now - +u.lastSeen < 10*60)
  const recent1d  = activeUsers.filter(u => now - +u.lastSeen < 24*60*60)
  const newUsers  = activeUsers.filter(u => now - +u.createdAt < 24*60*60)

  return (
        <div style={{ paddingBottom: '24px' }}>
            <h3 style={{ ... styles.h3, zIndex: 1, position: 'relative', marginBottom: '30px' }}>{ quote }</h3>
            <div style={styles.dashboardGrid}>
                <div style={styles.card}>
                    <h3 style={styles.h3}>Камеры</h3>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {!cameras?.length ? "Камеры не добавлены" : cameras.map(cam => (
                            <li key={cam.id} style={styles.cameraListItem}>
                                <span>{cam.name}</span>
                                <span style={{ ...styles.cameraStatus, color: cam.ready ? '#48bb78' : '#f56565' }}>
                                    <span style={{ ...styles.cameraStatusDot, backgroundColor: cam.ready ? '#48bb78' : '#f56565' }}></span>
                                    {cam.ready ? "В сети" : "Недоступна"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div style={styles.card}>
                    <h3 style={styles.h3}>Участники</h3>
                    <div style={styles.dashboardStatsGrid}>
                       <p>Всего в группе</p> <p style={styles.dashboardStatValue}>{users?.length ?? 0}</p>
                       <p>Активные (10 мин)</p> <p style={styles.dashboardStatValue}>{recent10m.length}</p>
                       <p>Активные (1 день)</p> <p style={styles.dashboardStatValue}>{recent1d.length}</p>
                       <p>Новых участников</p> <p style={styles.dashboardStatValue}>{newUsers.length}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

