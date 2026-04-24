import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router, { setupRouterGuards } from './router'
import { configureApiClient } from './lib/api-client'
import { useAuthStore } from './stores/auth'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

const authStore = useAuthStore(pinia)
configureApiClient({
  getAccessToken: () => authStore.accessToken,
  refreshAccessToken: () => authStore.refreshAccessToken(),
})

setupRouterGuards(pinia)
app.use(router)

authStore.initialize().finally(() => {
  app.mount('#app')
})
