const API_ROOT = process.env.API_ROOT

const request = async (url, data) => {
    try {
        const response = await fetch(API_ROOT + url, { 
            ...data,
            body: JSON.stringify(data.body),
            headers: {
                'X-Secret': process.env.SECRET
            }
        });
        return response.json()
    } catch (e) {
        console.log(e)
    }
}

export default request
