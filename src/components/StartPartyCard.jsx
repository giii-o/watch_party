// StartPartyCard: the "start a watch party" action on the Home page.
// Props:
// - onStart: function to call when the user clicks Start
// - isDisabled: true while a room is being created (button shows a loading state)
const StartPartyCard = ({ onStart, isDisabled = false }) => {
  return (
    <section className="card">
      <p className="eyebrow">Start</p>
      <h2 className="card__title">Start a watch party</h2>
      <p className="card__text">
        Create a room, add videos, and share the code with your people.
      </p>
      <button className="button button--primary" onClick={onStart} disabled={isDisabled}>
        {isDisabled ? 'Creating room...' : 'Start a party'}
      </button>
    </section>
  )
}

export default StartPartyCard
