export const oauthKeys = ['linuxdo', 'github', 'google', 'nodeloc']

export const oauthProviderList = [
  { key: 'google', label: 'Google', icon: 'devicon:google', iconType: 'iconify' },
  { key: 'github', label: 'GitHub', icon: 'codicon:github-inverted', iconType: 'iconify' },
  { key: 'linuxdo', label: 'LinuxDo', icon: '/image/linuxdo.webp', iconType: 'image' },
  { key: 'nodeloc', label: 'NodeLoc', icon: '/image/nodeloc.png', iconType: 'image' },
]

const authorizeUrls = {
  linuxdo: (clientId, redirectUri, state) => `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${state}`,
  github: (clientId, redirectUri, state) => `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email&state=${state}`,
  google: (clientId, redirectUri, state) => `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${state}`,
  nodeloc: (clientId, redirectUri, state) => `https://www.nodeloc.com/oauth-provider/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${state}`,
}

/**
 * 生成第三方登录授权地址
 * @param provider 平台标识
 * @param clientId 平台客户端 id
 * @param redirectUri 回调地址（未编码，内部会编码）
 * @param state 透传状态，默认平台标识
 */
export function oauthAuthorizeUrl(provider, clientId, redirectUri, state = provider) {
  const builder = authorizeUrls[provider]
  if (!builder) {
    return null
  }
  return builder(clientId, encodeURIComponent(redirectUri), state)
}
