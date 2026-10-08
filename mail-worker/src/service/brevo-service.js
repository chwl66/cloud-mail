import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const brevoService = {

	async webhooks(c, body) {

		const brevoEmailId = emailService.normalizeProviderId(body['message-id']);

		if (!brevoEmailId) {
			throw new BizError('Brevo webhook missing message-id');
		}

		const params = {
			brevoEmailId: brevoEmailId,
			status: emailConst.status.SENT
		}

		if (body.event === 'delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.event === 'spam') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.event === 'hard_bounce' || body.event === 'invalid_email' || body.event === 'blocked') {
			params.status = emailConst.status.BOUNCED
			params.message = body.reason ? JSON.stringify({ reason: body.reason }) : null
		}

		if (body.event === 'soft_bounce' || body.event === 'deferred') {
			params.status = emailConst.status.DELAYED
			params.message = body.reason ? JSON.stringify({ reason: body.reason }) : null
		}

		if (body.event === 'error') {
			params.status = emailConst.status.FAILED
			params.message = body.reason || null
		}

		const emailRow = await emailService.updateEmailStatusByBrevoId(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default brevoService
