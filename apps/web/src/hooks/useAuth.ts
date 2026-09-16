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

function saveSubdomain(subdomain: string | undefined) {
  if (subdomain && typeof window !== 'undefined') {
    window.localStorage.setItem('examify_school', subdomain)
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  setAuth: (token, user) => {
    console.log('[SET AUTH] called with', { tokenType: typeof token, tokenLength: token?.length, tokenPreview: token?.slice(0, 15), userRole: user?.role })
    try {
      Cookies.set('examify_token', token, { expires: 0.5, sameSite: 'strict' })
      console.log('[SET AUTH] Cookies.set completed, cookie now reads:', Cookies.get('examify_token')?.slice(0, 15))
    } catch (err) {
      console.error('[SET AUTH] Cookies.set THREW AN ERROR:', err)
    }
    saveSubdomain(user?.school?.subdomain)
    set({ token, user, isLoading: false })
  },

  logout: () => {
    Cookies.remove('examify_token')
    set({ user: null, token: null, isLoading: false })
  },

  hydrate: async () => {
    const token = Cookies.get('examify_token')
  if (!token) { console.log('[HYDRATE] no cookie found'); set({ isLoading: false }); return }
  try {
    const { api } = await import('../lib/api')
    const { user } = await api.me()
    console.log('[HYDRATE] success, user role:', user?.role)
    saveSubdomain(user?.school?.subdomain)
    set({ token, user, isLoading: false })
  } catch (err) {
   
    Cookies.remove('examify_token')
    set({ user: null, token: null, isLoading: false })
  }
},
}))
