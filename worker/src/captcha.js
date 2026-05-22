/**
 * Placeholder CAPTCHA verification.
 * Returns true when CAPTCHA is disabled; otherwise throws an error.
 *
 * @param {string|null} captchaToken - Token received from the client.
 * @param {string} requestIp - IP address of the requester.
 * @param {any} env - Environment variables (CAPTCHA_ENABLED).
 * @returns {Promise<boolean>} True if CAPTCHA is valid or disabled.
 */
export async function verifyCaptcha(captchaToken, requestIp, env) {
  if (env.CAPTCHA_ENABLED !== 'true') {
    return true;
  }
  throw new Error('CAPTCHA_ENABLED is true, but captcha verification is not implemented yet');
}