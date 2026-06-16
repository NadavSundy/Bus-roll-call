export const getAppUrl = () => {
  return import.meta.env.VITE_APP_URL || window.location.origin
}
