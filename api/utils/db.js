import sequelize from '../db/index'

const ALLOWED_TABLES = {
    Camera: ['name', 'config', 'media', 'groupId'],
    Group: ['name'],
    GroupUser: ['name', 'role', 'avatar'],
    User: ['name'],
    Session: ['disabled', 'name']
}

const sendJson = (json, status = 200) => {
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
}

export const patch = async request => {
    try {
        const { table, id, key, value } = await request.json()
        const recordId = Number(id)
        if (!recordId || Number.isNaN(recordId)) return sendJson({ error: 'Invalid id' }, 400)
        
        if (!ALLOWED_TABLES[table] || !ALLOWED_TABLES[table].includes(key)) {
            return sendJson({ error: 'Disallowed table or column name' }, 400)
        }
        
        const replacements = { id: recordId, val: value }
        const response = await sequelize.query(
            `UPDATE "${table}" SET "${key}" = :val WHERE id = :id`,
            {
                replacements,
                type: sequelize.QueryTypes.UPDATE
            }
        )
        
        return sendJson({ success: true, response })
    } catch (e) {
        return sendJson({ error: e.message }, 500)
    }    
}

export default {
    patch
}
