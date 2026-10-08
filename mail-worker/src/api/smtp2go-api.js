import smtp2goService from '../service/smtp2go-service';
import app from '../hono/hono';
app.post('/webhooks/smtp2go', async (c) => {
	try {
		await smtp2goService.webhooks(c, await c.req.json());
		return c.text('success', 200)
	} catch (e) {
		return c.text(e.message, 500)
	}
})
