import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';

const sendflareService = {

	async webhooks(c, body) {

		//兼容 { type, data } 与事件字段平铺两种载荷格式
		const payload = body?.data && typeof body.data === 'object' ? body.data : body;

		const sendflareEmailId = emailService.normalizeProviderId(payload?.emailId);

		if (!sendflareEmailId) {
			throw new BizError('Sendflare webhook missing emailId');
		}

		const event = String(body?.type || payload?.type || '').toLowerCase();

		const params = {
			sendflareEmailId: sendflareEmailId,
			status: emailConst.status.SENT
		}

		if (event === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (event === 'email.complaint') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (event === 'email.bounced') {
			const bounceType = String(payload?.bounce?.type || '').toLowerCase();
			if (bounceType.includes('transient') || bounceType.includes('soft')) {
				params.status = emailConst.status.DELAYED
			} else {
				params.status = emailConst.status.BOUNCED
			}
			const reason = payload?.bounce?.subType || payload?.bounce?.type;
			params.message = reason ? JSON.stringify({ reason: reason }) : null
		}

		const emailRow = await emailService.updateEmailStatusBySendflareId(c, params)

		if (!emailRow) {
			throw new BizError('更新邮件状态记录失败');
		}

	}
}

export default sendflareService
