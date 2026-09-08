(() => {
  'use strict';

  // Static portals may use a separate HTTPS API origin. Never derive it from
  // the URL query string, local storage, or values returned by another server.
  const nativeFetch = window.fetch.bind(window);
  const pageOrigin = window.location.origin;
  let apiOrigin = pageOrigin;
  let configurationError = '';
  const configured = window.PAICHONG_API_BASE;
  if (configured !== undefined && configured !== '') {
    try {
      if (typeof configured !== 'string' || configured !== configured.trim()) throw new Error();
      const parsed = new URL(configured);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash ||
        parsed.pathname !== '/' || !/^https:\/\/[^/?#\\]+\/?$/.test(configured)) throw new Error();
      apiOrigin = parsed.origin;
    } catch {
      configurationError = '演示服务地址配置无效，请联系演示管理员配置 HTTPS 服务地址。';
    }
  }

  window.PAICHONG_API_ERROR = configurationError;
  window.fetch = (input, init) => {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    let url;
    try {
      url = new URL(isRequest ? input.url : String(input), window.location.href);
    } catch {
      return nativeFetch(input, init);
    }
    const isLocalApi = url.origin === pageOrigin && (url.pathname.startsWith('/api/') || url.pathname === '/health');
    if (!isLocalApi) return nativeFetch(input, init);
    if (configurationError) return Promise.reject(new Error(configurationError));
    if (url.hash || url.username || url.password) return Promise.reject(new Error('演示服务请求地址无效。'));
    const destination = `${apiOrigin}${url.pathname}${url.search}`;
    const options = { ...init, redirect: 'error' };
    if (apiOrigin !== pageOrigin) options.credentials = 'omit';
    if (isRequest) {
      // Constructing from a Request preserves headers, method and streaming
      // body, rather than accidentally turning an existing POST into a GET.
      try { return nativeFetch(new Request(destination, input), options); }
      catch (error) { return Promise.reject(error); }
    }
    return nativeFetch(destination, options);
  };
})();
