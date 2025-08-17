import './LoadingBar.css'

function LoadingBar({ message = "Loading..." }) {
  return (
    <div className="loading-container">
      <div className="loading-text">{message}</div>
      <div className="loading-bar-wrapper">
        <div className="loading-bar">
          <div className="loading-bar-fill"></div>
        </div>
      </div>
    </div>
  )
}

export default LoadingBar
