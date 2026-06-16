export const getAppUrl = () => {
  const configuredUrl = import.meta.env.VITE_APP_URL || window.location.origin
  return configuredUrl.replace(/\/+$/, '')
}

export const getAuthCallbackUrl = () => `${getAppUrl()}/?auth=callback`

export const getPasswordResetUrl = () => `${getAppUrl()}/?auth=reset-password`
