import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  updateUser: (user: Partial<User>) => void;
  clearAuth: () => void;
  getAuthTokens: () => { accessToken: string | null; refreshToken: string | null };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) =>
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
        }),

      updateUser: (userData) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        })),

      clearAuth: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        }),

      getAuthTokens: () => ({
        accessToken: get().accessToken,
        refreshToken: get().refreshToken,
      }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Selectors
export const getAuthTokens = () => useAuthStore.getState().getAuthTokens();
export const setAuthTokens = (tokens: { accessToken: string; refreshToken: string }) => {
  useAuthStore.getState().setAuth(
    useAuthStore.getState().user!,
    tokens.accessToken,
    tokens.refreshToken
  );
};
export const clearAuthTokens = () => useAuthStore.getState().clearAuth();
export const getUser = () => useAuthStore.getState().user;
export const isAuthenticated = () => useAuthStore.getState().isAuthenticated;