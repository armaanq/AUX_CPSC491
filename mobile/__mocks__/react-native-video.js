// Stand-in for the native player in tests (Jest uses it automatically).
// Renders a View carrying the player's props so tests can read `paused`,
// `source` and fire onEnd / onError.
const React = require('react');
const { View } = require('react-native');

function Video(props) {
  return React.createElement(View, props);
}

module.exports = Video;
module.exports.default = Video;
module.exports.__esModule = true;
