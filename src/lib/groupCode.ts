const GROUP_CODE_LENGTH = 6
const GROUP_CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export const generateGroupCode = (): string => {
  return Array.from({ length: GROUP_CODE_LENGTH }, () => {
    const index = Math.floor(Math.random() * GROUP_CODE_CHARACTERS.length)
    return GROUP_CODE_CHARACTERS[index]
  }).join('')
}
