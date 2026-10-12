import BizError from "../error/biz-error";
import orm from "../entity/orm";
import {oauth} from "../entity/oauth";
import { and, eq, inArray } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import settingService from "./setting-service";
import {t} from '../i18n/i18n';

const oauthPlatforms = ['linuxdo', 'github', 'google', 'nodeloc'];

const oauthService = {

	async bindUser(c, params) {

		const { email, oauthUserId, platform, code } = params;

		if (!oauthPlatforms.includes(platform)) {
			throw new BizError(t('oauthPlatformInvalid'));
		}

		//第三方身份由平台 + 平台用户 id 共同确定，避免不同平台的 id 互相覆盖
		const oauthRow = await this.getByPlatform(c, platform, oauthUserId);

		if (!oauthRow) {
			throw new BizError(t('oauthNotAuthorized'));
		}

		let userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (userRow) {
			throw new BizError('用户已绑定有邮箱')
		}

		await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(), code }, true);

		userRow = await userService.selectByEmail(c, email);

		await orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthId, oauthRow.oauthId)).run();
		const jwtToken = await loginService.login(c, { email, password: null }, true);

		return { userInfo: oauthRow, token: jwtToken}
	},

	//绑定第三方登录到当前已注册账号
	async bindAccount(c, params, userId) {

		const { provider, code, redirectUri } = params;

		if (!oauthPlatforms.includes(provider)) {
			throw new BizError(t('oauthPlatformInvalid'));
		}

		const userInfo = await this.fetchUserInfo(c, provider, code, redirectUri);

		const oauthRow = await this.getByPlatform(c, provider, userInfo.oauthUserId);

		//该第三方账号已绑定到其他账号
		if (oauthRow && oauthRow.userId && oauthRow.userId !== userId) {
			throw new BizError(t('oauthBoundByOther'));
		}

		//当前账号已绑定该平台的其他第三方账号
		const boundRow = await this.getByUserIdAndPlatform(c, userId, provider);

		if (boundRow && boundRow.oauthUserId !== userInfo.oauthUserId) {
			throw new BizError(t('oauthPlatformBound'));
		}

		if (oauthRow) {
			await orm(c).update(oauth).set({ ...userInfo, userId }).where(eq(oauth.oauthId, oauthRow.oauthId)).run();
		} else {
			await orm(c).insert(oauth).values({ ...userInfo, userId }).run();
		}

		const row = await this.getByPlatform(c, provider, userInfo.oauthUserId);

		return this.toBindInfo(row);
	},

	async listByUserId(c, userId) {
		const list = await orm(c).select().from(oauth).where(eq(oauth.userId, userId)).all();
		return list.map(row => this.toBindInfo(row));
	},

	toBindInfo(row) {

		if (!row) {
			return null;
		}

		return {
			oauthId: row.oauthId,
			platform: row.platform,
			oauthUserId: row.oauthUserId,
			username: row.username,
			name: row.name,
			avatar: row.avatar,
			trustLevel: row.trustLevel,
			createTime: row.createTime
		};
	},

	getByPlatform(c, platform, oauthUserId) {
		return orm(c).select().from(oauth).where(
			and(
				eq(oauth.platform, platform),
				eq(oauth.oauthUserId, oauthUserId))
		).get();
	},

	getByUserIdAndPlatform(c, userId, platform) {
		return orm(c).select().from(oauth).where(
			and(
				eq(oauth.userId, userId),
				eq(oauth.platform, platform))
		).get();
	},

	//统一获取第三方用户信息（登录与绑定共用）
	async fetchUserInfo(c, provider, code, redirectUri) {

		const setting = await settingService.query(c);
		this.assertEnabled(setting, provider + 'Switch');

		if (provider === 'linuxdo') {

			const reqParams = new URLSearchParams()
			reqParams.append('client_id', setting.linuxdoClientId)
			reqParams.append('client_secret', setting.linuxdoClientSecret)
			reqParams.append('code', code)
			reqParams.append('redirect_uri', redirectUri)
			reqParams.append('grant_type', 'authorization_code')

			const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: reqParams.toString()
			})

			if (!tokenRes.ok) {
				throw new BizError(tokenRes.statusText)
			}

			const token = await tokenRes.json()

			const userRes = await fetch('https://connect.linux.do/api/user', {
				headers: {
					Authorization: 'Bearer ' + token.access_token
				}
			});

			if (!userRes.ok) {
				throw new BizError(userRes.statusText)
			}

			const userInfo = await userRes.json();

			userInfo.oauthUserId = String(userInfo.id);
			userInfo.active = userInfo.active ? 0 : 1;
			userInfo.silenced = userInfo.silenced ? 0 : 1;
			userInfo.trustLevel = userInfo.trust_level;
			userInfo.avatar = userInfo.avatar_url;
			userInfo.platform = 'linuxdo';

			return userInfo;
		}

		if (provider === 'github') {

			const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json"
				},
				body: JSON.stringify({
					client_id: setting.githubClientId,
					client_secret: setting.githubClientSecret,
					code: code,
					redirect_uri: redirectUri
				})
			});

			if (!tokenRes.ok) {
				throw new BizError(tokenRes.statusText);
			}

			const token = await tokenRes.json();

			if (token.error) {
				throw new BizError(token.error_description || token.error);
			}

			const userRes = await fetch('https://api.github.com/user', {
				headers: {
					Authorization: 'Bearer ' + token.access_token,
					'User-Agent': 'cloud-mail'
				}
			});

			if (!userRes.ok) {
				throw new BizError(userRes.statusText);
			}

			const userInfo = await userRes.json();

			userInfo.oauthUserId = String(userInfo.id);
			userInfo.username = userInfo.login;
			userInfo.avatar = userInfo.avatar_url;
			userInfo.platform = 'github';

			return userInfo;
		}

		if (provider === 'google') {

			const reqParams = new URLSearchParams()
			reqParams.append('client_id', setting.googleClientId)
			reqParams.append('client_secret', setting.googleClientSecret)
			reqParams.append('code', code)
			reqParams.append('redirect_uri', redirectUri)
			reqParams.append('grant_type', 'authorization_code')

			const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: reqParams.toString()
			});

			if (!tokenRes.ok) {
				throw new BizError(tokenRes.statusText);
			}

			const token = await tokenRes.json();

			const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
				headers: {
					Authorization: 'Bearer ' + token.access_token
				}
			});

			if (!userRes.ok) {
				throw new BizError(userRes.statusText);
			}

			const userInfo = await userRes.json();

			userInfo.oauthUserId = String(userInfo.sub);
			userInfo.username = userInfo.email;
			userInfo.name = userInfo.name;
			userInfo.avatar = userInfo.picture;
			userInfo.platform = 'google';

			return userInfo;
		}

		if (provider === 'nodeloc') {

			const reqParams = new URLSearchParams()
			reqParams.append('client_id', setting.nodelocClientId)
			reqParams.append('client_secret', setting.nodelocClientSecret)
			reqParams.append('code', code)
			reqParams.append('redirect_uri', redirectUri)
			reqParams.append('grant_type', 'authorization_code')

			const tokenRes = await fetch("https://www.nodeloc.com/oauth-provider/token", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: reqParams.toString()
			})

			if (!tokenRes.ok) {
				throw new BizError(tokenRes.statusText)
			}

			const token = await tokenRes.json()

			if (token.error) {
				throw new BizError(token.error_description || token.error)
			}

			const userRes = await fetch('https://www.nodeloc.com/oauth-provider/userinfo', {
				headers: {
					Authorization: 'Bearer ' + token.access_token
				}
			});

			if (!userRes.ok) {
				throw new BizError(userRes.statusText)
			}

			const userInfo = await userRes.json();

			userInfo.oauthUserId = String(userInfo.id);
			userInfo.username = userInfo.username;
			userInfo.name = userInfo.name;
			userInfo.avatar = userInfo.avatar_url;
			userInfo.trustLevel = userInfo.trust_level;
			userInfo.platform = 'nodeloc';

			return userInfo;
		}

		throw new BizError(t('oauthPlatformInvalid'));
	},

	async linuxDoLogin(c, params) {
		const userInfo = await this.fetchUserInfo(c, 'linuxdo', params.code, params.redirectUri);
		return await this.saveAndLogin(c, userInfo)
	},

	async githubLogin(c, params) {
		const userInfo = await this.fetchUserInfo(c, 'github', params.code, params.redirectUri);
		return await this.saveAndLogin(c, userInfo);
	},

	async googleLogin(c, params) {
		const userInfo = await this.fetchUserInfo(c, 'google', params.code, params.redirectUri);
		return await this.saveAndLogin(c, userInfo);
	},

	async nodelocLogin(c, params) {
		const userInfo = await this.fetchUserInfo(c, 'nodeloc', params.code, params.redirectUri);
		return await this.saveAndLogin(c, userInfo);
	},

	async saveAndLogin(c, userInfo) {

		const oauthRow = await this.saveUser(c, userInfo);
		const userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (!userRow) {
			return { userInfo: oauthRow, token: null };
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken };
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getByPlatform(c, userInfo.platform, userInfo.oauthUserId);

		if (!userInfoRow) {
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			return await orm(c).update(oauth).set(userInfo).where(eq(oauth.oauthId, userInfoRow.oauthId)).returning().get();
		}

	},

	assertEnabled(setting, switchKey) {
		if (setting[switchKey] !== 0) {
			throw new BizError(t('oauthDisabled'));
		}
	},

	async deleteByUserId(c, userId) {
		await this.deleteByUserIds(c, [userId]);
	},

	async deleteByUserIds(c, userIds) {
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
	},

	//定时任务凌晨清除未绑定邮箱的oauth用户
	async clearNoBindOathUser(c) {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	},

}

export default  oauthService
