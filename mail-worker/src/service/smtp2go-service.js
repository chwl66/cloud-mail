import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const smtp2goService = {

	async webhooks(c, body) {

		const smtp2goEmailId = emailService.normalizeProviderId(body.email_id);

		if (!smtp2goEmailId) {
			throw new BizError('SMTP2GO webhook missing email_id');
		}

		const event = String(body.event || '').toLowerCase();

		const params = {
			smtp2goEmailId: smtp2goEmailId,
			status: emailConst.status.SENT
		}

		if (event === 'delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (event === 'spam') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (event === 'bounce' || event === 'hard_bounce' || event === 'soft_bounce') {
			const bounceType = String(body.bounce || event).toLowerCase();
			if (bounceType.includes('soft')) {
				params.status = emailConst.status.DELAYED
			} else {
				params.status = emailConst.status.BOUNCED
			}
			params.message = body.reason ? JSON.stringify({ reason: body.reason }) : null
		}

		if (event === 'reject') {
			params.status = emailConst.status.BOUNCED
			params.message = body.reason ? JSON.stringify({ reason: body.reason }) : null
		}

		const emailRow = await emailService.updateEmailStatusBySmtp2goId(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default smtp2goService
