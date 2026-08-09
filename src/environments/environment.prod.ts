export const environment = {
  production: true,
  // In docker-compose.prod, nginx proxies `/api` to the backend container.
  // Keep production API calls same-origin to avoid CORS/TLS issues and to
  // ensure session validation works after page refresh.
  apiUrl: '/api',
  // When the frontend is hosted on GitHub Pages (ivan-webpage.github.io), there is no /api proxy.
  // Use the backend absolute API URL instead.
  githubPagesApiUrl: 'https://galaxyhouse-finance.zeabur.app/api',
  googleClientId: '957974561982-c8gfted5logjoglj8hspaiad8q8jpl1g.apps.googleusercontent.com'
};
