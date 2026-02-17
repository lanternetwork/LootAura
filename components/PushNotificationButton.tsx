'use client'
import { useState, useEffect } from 'react'
import { PushNotificationService } from '@/lib/pushNotifications'

export default function PushNotificationButton() {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pushService = PushNotificationService.getInstance()

  useEffect(() => {
    const checkSupport = async () => {
      const supported = 'Notification' in window && 
                       'serviceWorker' in navigator && 
                       'PushManager' in window
      setIsSupported(supported)

      if (supported) {
        try {
          const subscribed = await pushService.isSubscribed()
          setIsSubscribed(subscribed)
        } catch (error) {
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.error('Error checking subscription status:', error)
          }
        }
      }
    }

    checkSupport()
  }, [pushService])

  const handleSubscribe = async () => {
    if (!isSupported) return

    setIsLoading(true)
    setError(null)

    try {
      const subscriptionData = await pushService.subscribe()
      if (subscriptionData) {
        await pushService.saveSubscription(subscriptionData)
        setIsSubscribed(true)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to subscribe')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnsubscribe = async () => {
    if (!isSupported) return

    setIsLoading(true)
    setError(null)

    try {
      const success = await pushService.unsubscribe()
      if (success) {
        // Get current subscription to get endpoint for removal
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        
        if (subscription) {
          await pushService.removeSubscription(subscription.endpoint)
        }
        
        setIsSubscribed(false)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to unsubscribe')
    } finally {
      setIsLoading(false)
    }
  }

  const handleTest = async () => {
    if (!isSupported || !isSubscribed) return

    setIsLoading(true)
    setError(null)

    try {
      await pushService.testNotification()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send test notification')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isSupported) {
    return (
      <div className="text-sm text-neutral-500">
        Push notifications not supported in this browser
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
          disabled={isLoading}
          className={`px-4 py-2 rounded text-sm font-medium ${
            isSubscribed
              ? 'bg-red-100 text-red-700 hover:bg-red-200'
              : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
          } disabled:opacity-50`}
        >
          {isLoading ? 'Loading...' : isSubscribed ? 'Unsubscribe' : 'Subscribe to Notifications'}
        </button>

        {isSubscribed && (
          <button
            onClick={handleTest}
            disabled={isLoading}
            className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 disabled:opacity-50"
          >
            Test
          </button>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="text-xs text-neutral-500">
        {isSubscribed 
          ? 'You\'ll receive notifications about new sales in your area'
          : 'Get notified about new yard sales near you'
        }
      </div>
    </div>
  )
}
