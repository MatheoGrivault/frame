const userEvent = require('@testing-library/user-event').default
const { render, act } = require('@testing-library/react')

const advanceTimersByTime = async (ms = 0) => {
  jest.advanceTimersByTime(ms)
  return Promise.resolve()
}

async function actAndWait(fn, ms = 0) {
  await fn()
  act(() => jest.advanceTimersByTime(ms))
}

function setupComponent(jsx, opts = {}) {
  const { advanceTimersAfterInput = false, ...options } = opts
  const advanceTimers =
    options.advanceTimers ||
    (advanceTimersAfterInput === true
      ? () => jest.runAllTimers()
      : () => advanceTimersByTime(advanceTimersAfterInput || 0))

  render(jsx)

  return {
    user: userEvent.setup({
      ...options,
      advanceTimers
    })
  }
}

export * from '@testing-library/react'

export { actAndWait, setupComponent as render }
