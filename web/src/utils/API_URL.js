const mode = import.meta.env.MODE
export default mode === 'development' ? "http://localhost:3033/" : "/cctv-api/"
