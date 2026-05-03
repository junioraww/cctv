import redis from 'redis'

const client = redis.createClient({
    url: process.env.REDIS_PASSWORD ?
    `redis://default:${process.env.REDIS_PASSWORD}@localhost:6379`
    : `redis://localhost:6379`
})
await client.connect()
console.log('Redis connected')

export default client
