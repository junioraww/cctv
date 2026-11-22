import React, { useState, useEffect, useRef , useMemo } from 'react'
import VideoPlayer from '../components/VideoPlayer'
import styles from '../styles'

export default function Cameras({ cameras, group, api, isMobile }) {
    const [ selectedCount, setSelectedCount ] = useState(1);
    const [ selectedCams, setSelectedCams ] = useState(cameras.length > 0 ? [ cameras[0].id ] : []);
    
    const toggleCam = (id) => {
      if (selectedCams.includes(id)) {
        setSelectedCams(selectedCams.filter((x) => x !== id))
      } else {
        /* На моб. устройствах нет сетки */
        if (isMobile || selectedCams.length < selectedCount) {
          setSelectedCams([ ...selectedCams, id ])
        }
        else {
          const cams = selectedCams
          cams.splice(0, 1)
          setSelectedCams([ ...cams, id ])
        }
      }
  }
    
    const gridLayout = useMemo(() => {
        if(selectedCams.length > selectedCount) setSelectedCams(selectedCams.slice(0, selectedCount))
        else {
            let diff = selectedCount - selectedCams.length;
            console.log(diff)
            const camIds = cameras.map(x => x.id)
            const addedCams = [];
            for (const camId of camIds) {
                if (diff < 1) break;
                if (selectedCams.find(x => x == camId)) continue;
                addedCams.push(camId)
                diff -= 1;
            }
            setSelectedCams([ ...selectedCams, ...addedCams ])
        }
        
        if (selectedCount === 1) return { ...styles.cameraGridBase, ...styles.grid1 };
        if (selectedCount === 2) return { ...styles.cameraGridBase, ...styles.grid2 };
        if (selectedCount === 4) return { ...styles.cameraGridBase, ...styles.grid4 };
        return { ...styles.cameraGridBase, ...styles.grid1 };
    }, [ selectedCount ]);

    return (
        <div style={{ paddingBottom: isMobile ? '32px' : '48px' }}>
            <div style={{ ...styles.card, marginBottom: '24px',  }}>
                {!isMobile && (
                    <div style={{ ...styles.flexColumnGap10, marginBottom: '24px' }}>
                        <h3 style={styles.h3}>Размер сетки</h3>
                        <div style={styles.cameraControls}>
                            {[1, 2, 4].map((count) => (
                                <button key={count} onClick={() => setSelectedCount(count)} style={{ ...styles.button, ...(selectedCount === count ? styles.buttonPrimary : styles.buttonSecondary) }}>
                                    {count}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div style={styles.flexColumnGap10}>
                    <h3 style={styles.h3}>
                        Камеры {isMobile ? "" : `(${selectedCams.length}/${selectedCount})`}
                    </h3>
                    <div style={styles.cameraSelector}>
                        {(cameras || []).map(({ id, name, ready }) => (
                            <button
                                key={id}
                                onClick={() => toggleCam(id)}
                                style={{
                                    ...styles.button,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    ...(selectedCams.includes(id) ? styles.buttonPrimary : styles.buttonSecondary)
                                }}
                            >
                                <CameraSvgIcon ready={ready} active={selectedCams.includes(id)} />
                                <span>{name}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {isMobile ? (
                <div style={{ ...styles.mobileCameraList, ...styles.flexColumnGap10, paddingBottom: '24px' }}>
                    {selectedCams.map(id => {
                        const cam = cameras.find(c => c.id === id);
                        if (!cam) return null;
                        const source = cam.media?.find(x => x.type === 'hls');
                        const ptz = cam.media?.find(x => x.type === 'ptz') ? `cameras/${cam.id}/ptz` : null;
                        return (
                            <div key={id} style={styles.mobileCameraItem}>
                                <VideoPlayer api={api} ready={cam.ready} groupId={group} token={cam.token} url={source?.url} ptzEndpoint={ptz} isMobile={isMobile} cameraName={cam.name} />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={gridLayout}>
                    {selectedCams.map(id => {
                        const cam = cameras.find(c => c.id === id);
                        if (!cam) return null;
                        const source = cam.media?.find(x => x.type === 'hls');
                        const ptz = cam.media?.find(x => x.type === 'ptz') ? `cameras/${cam.id}/ptz` : null;
                        return (
                           <div key={id} style={styles.cameraGridItem}>
                                <VideoPlayer api={api} ready={cam.ready} groupId={group} token={cam.token} url={source?.url} ptzEndpoint={ptz} isMobile={isMobile} cameraName={cam.name} />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function CameraSvgIcon({ ready, active }) {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M23 7l-7 5 7 5V7z"></path>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            {ready !== undefined && (
                <circle cx="5" cy="9" r="1.5" fill={ready ? "#48bb78" : "#f56565"} stroke="none" />
            )}
        </svg>
    );
}
