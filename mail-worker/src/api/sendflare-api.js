import sendflareService from '../service/sendflare-service';
import app from '../hono/hono';
app.post('/webhooks/sendflare', async (c) => {
	try {
		await sendflareService.webhooks(c, await c.req.json());
		return c.text('success', 200)
	} catch (e) {
		return c.text(e.message, 500)
	}
})
