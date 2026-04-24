import { createRouter, createWebHistory } from 'vue-router'
import type { Pinia } from 'pinia'
import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import SignupView from '../views/SignupView.vue'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: {
        guestOnly: true,
      },
    },
    {
      path: '/signup',
      name: 'signup',
      component: SignupView,
      meta: {
        guestOnly: true,
      },
    },
  ],
})

export function setupRouterGuards(pinia: Pinia) {
  router.beforeEach(async (to) => {
    const authStore = useAuthStore(pinia)
    await authStore.initialize()

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
      return {
        name: 'login',
        query: {
          redirect: to.fullPath,
        },
      }
    }

    if (to.meta.guestOnly && authStore.isAuthenticated) {
      return {
        name: 'home',
      }
    }

    return true
  })
}

export default router
