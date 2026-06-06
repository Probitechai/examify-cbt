import { create } from 'zustand'
import Cookies from 'js-cookie'
import type { AuthUser } from '../types'

interface AuthState {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  setAuth: (token: string, user: AuthUser) => void
  logout: () => void
  hydrate: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  setAuth: (token, user) => {
    Cookies.set('examify_token', token, { expires: 0.5, sameSite: 'strict' }) // 12h
    set({ token, user, isLoading: false })
  },

  logout: () => {
    Cookies.remove('examify_token')
    set({ token: null, user: null, isLoading: false })
  },

  hydrate: async () => {
    const token = Cookies.get('examify_token')
    if (!token) { set({ isLoading: false }); return }
    try {
      const { api } = await import('../lib/api')
      const { user } = await api.me()
      set({ token, user, isLoading: false })
    } catch {
      Cookies.remove('examify_token')
      set({ isLoading: false })
    }
  },
}))
