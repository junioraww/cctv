import React, { useMemo } from 'react'
import Avatar from '../components/Avatar'
import TimeAgo from '../utils/timeAgo'
import styles from '../styles'

export default function Participants({ users }) {
    const sortedUsers = useMemo(() => {
        return (users || [])
            .filter(u => !u.expiresAt || new Date(u.expiresAt) > new Date())
            .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    }, [users]);
    
    return (
        <div style={{maxWidth: '800px', margin: '0 auto', paddingBottom: '24px'}}>
            <div style={styles.card}>
                <ul style={styles.participantList}>
                    {sortedUsers.map(({ id, name, avatar, lastSeen }) => (
                        <li key={id} style={styles.participantListItem}>
                            <div style={styles.participantAvatarContainer}>
                                <Avatar src={avatar} name={name} alt={name} size={48} />
                            </div>
                            <div>
                                <div style={styles.participantName}>{name}</div>
                                <div style={styles.participantLastSeen}>
                                    Был(а) в сети: <TimeAgo unixTime={lastSeen * 1000}/>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
