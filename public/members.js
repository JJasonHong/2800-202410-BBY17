 //lock capsule button
 document.addEventListener('DOMContentLoaded', function () {
    const capsule = document.getElementById('capsuleTitle').value;
    const lockButton = document.getElementById('lock');

    lockButton.addEventListener('click', function () {
      alert('Capsule ' + capsule + ' locked!');
    });

  });

  //unlock capsule button
  document.addEventListener('DOMContentLoaded', function () {
    const capsule = document.getElementById('capsuleTitle').value;
    const unlockButton = document.getElementById('unlock');

    unlockButton.addEventListener('click', function () {
      alert('Capsule ' + capsule + ' unlocked!');
    });
  });