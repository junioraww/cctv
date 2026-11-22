import { Sequelize, Op } from '@sequelize/core'
import User from '../db/models/User'
import Session from '../db/models/Session'
import Invite from '../db/models/Invite'
import GroupUser from '../db/models/GroupUser'
import { createInviteToken } from '../utils/tokens.js'
import sequelize from '../db/index.js'

const NONCE_SIZE = 8

const InviteController = new class InviteController {
    /*
    // Link creation from bot
    */
    async create(request, isInternalRequest) {
        if(request.access !== 'ALL') return sendJson({ error: 'No Access' }, 403)
        const { userId, groupId, isTemporary, durationMinutes } = await request.json()
        if (!groupId) return sendJson({ error: 'groupId is required' }, 400)
        
        const nonce = crypto.getRandomValues(new Uint8Array(4))
                    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');
        
        const inviteEntity = await Invite.create({
            creatorId: userId,
            groupId,
            nonce,
            isTemporary: Boolean(isTemporary),
            durationMinutes: isTemporary && durationMinutes ? Number(durationMinutes) : null,
            expiresAt: Math.floor(Date.now() / 60000) + 60
        })
        const invite = inviteEntity.get({ plain: true })
        
        return sendJson(invite)
    }
    
    async accept(nonce) {
        if (nonce && typeof nonce === 'string' && nonce.length !== NONCE_SIZE) {
            const match = nonce.match(/[a-fA-F0-9]{8}/);
            if (match) nonce = match[0];
        }
        if (!nonce || nonce.length !== NONCE_SIZE) 
            return sendJson({ error: 'Invalid nonce' })

        try {
            const result = await sequelize.transaction(async (t) => {
                const invite = await Invite.findOne({
                    where: { nonce, used: false },
                    include: [{
                        association: 'group',
                        required: true
                    }],
                    lock: t.LOCK.UPDATE,
                    transaction: t
                });

                if (!invite) throw new Error('Invite Used');

                invite.used = true;
                invite.expiresAt += 5;

                await invite.save({ transaction: t });

                return invite;
            });

            const token = createInviteToken(result.id, result.group.id, 300);

            const domain = process.env.COOKIE_DOMAIN?.trim()
            const domainAttr = (domain && !['.domain.com', 'domain.com', '.cam.lisyak.net', '.localhost'].includes(domain)) ? ` Domain=${domain};` : ''
            const headers = {
                'Set-Cookie': `invite=${token}; Path=/;${domainAttr} Secure; HttpOnly; SameSite=Lax; Max-Age=3600;`
            };

            const group = { 
                id: result.group.id, 
                name: result.group.name,
                isTemporary: result.isTemporary,
                durationMinutes: result.durationMinutes,
                nonce: result.nonce,
                inviteId: result.id
            };

            return sendJson({ success: true, group, nonce: result.nonce, inviteId: result.id }, headers);

        } catch (err) {
            return sendJson({ error: err.message });
        }
    }

    async join(request, nonce) {
        const { userId } = request
        if (!userId) return sendJson({ error: 'Unauthorized' }, 401)
        if (nonce && typeof nonce === 'string' && nonce.length !== NONCE_SIZE) {
            const match = nonce.match(/[a-fA-F0-9]{8}/);
            if (match) nonce = match[0];
        }
        if (!nonce || nonce.length !== NONCE_SIZE) return sendJson({ error: 'Invalid code' }, 400)

        try {
            const result = await sequelize.transaction(async (t) => {
                const invite = await Invite.findOne({
                    where: { nonce, used: false },
                    include: [{ association: 'group', required: true }],
                    lock: t.LOCK.UPDATE,
                    transaction: t
                })

                if (!invite) throw new Error('Приглашение не найдено или уже использовано')
                if (invite.expiresAt < Math.floor(Date.now() / 60000)) {
                    throw new Error('Срок действия кода приглашения истек')
                }

                const existing = await GroupUser.findOne({
                    where: { userId, groupId: invite.groupId },
                    transaction: t
                })
                if (existing) {
                    throw new Error('Вы уже являетесь участником этой группы')
                }

                const user = await User.findByPk(userId, { transaction: t })
                if (!user) throw new Error('Пользователь не найден')

                let expiresAt = null
                if (invite.isTemporary && invite.durationMinutes > 0) {
                    expiresAt = new Date(Date.now() + invite.durationMinutes * 60000)
                }

                const groupUser = await GroupUser.create({
                    userId,
                    groupId: invite.groupId,
                    name: user.name || 'Участник',
                    avatar: null,
                    expiresAt,
                    role: 0
                }, { transaction: t })

                invite.used = true
                invite.usedById = userId
                await invite.save({ transaction: t })

                return { group: invite.group, groupUser }
            })

            return sendJson({ success: true, group: result.group })
        } catch (err) {
            return sendJson({ error: err.message }, 400)
        }
    }

}

setInterval(destroyExpired, 60 * 1000);
setTimeout(destroyExpired, 2 * 1000);

async function destroyExpired() {
    const amount = await Invite.destroy({
        where: {
            expiresAt: {
                [Sequelize.Op.lte]: Math.floor(new Date() / 60000)
            },
            usedById: {
                [Op.in]: [null, 0]
            }
        }
    })
    if(amount) console.log('Очищено Invite:', amount)
    return amount
}

console.log("Настроен таймер удаления истекших Invite")

const sendJson = (json, headers) => {
    return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json', ...headers } })
}

export default InviteController
