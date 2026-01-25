// webrtc/signaling.js
// Bu backend için signaling utilities

export const signalingEvents = {
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice'
};

export function validateSignalData(data) {
  if (!data || !data.type) {
    throw new Error('Invalid signal data: missing type');
  }

  const validTypes = Object.values(signalingEvents);
  if (!validTypes.includes(data.type)) {
    throw new Error(`Invalid signal type: ${data.type}`);
  }

  return true;
}