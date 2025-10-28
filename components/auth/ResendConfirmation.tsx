'use client'

import { useState } from 'react'

interface ResendConfirmationProps {
  email: string
}

export default function ResendConfirmation({ email }: ResendConfirmationProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleResend = async () => {
    setIsLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/auth/resend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const _data = await response.json()

      if (response.ok) {
        setMessage('Confirmation email sent! Please check your inbox.')
      } else {
        setMessage('Failed to send confirmation email. Please try again.')
      }
    } catch (error) {
      setMessage('Failed to send confirmation email. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <p className="text-sm text-blue-800 mb-2">
        Didn't receive the confirmation email?
      </p>
      <button
        onClick={handleResend}
        disabled={isLoading}
        className="text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
      >
        {isLoading ? 'Sending...' : 'Resend confirmation email'}
      </button>
      {message && (
        <p className={`text-sm mt-2 ${message.includes('sent') ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
