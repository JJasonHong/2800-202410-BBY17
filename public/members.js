document.addEventListener('DOMContentLoaded', function () {
    const easterEgg = document.getElementById('darkModeToggle');
    const shootingStar = document.querySelector('.shooting-star');

    // Function to show the shooting star
    function showShootingStar() {
        shootingStar.style.display = 'inline-block';
    }

    // Function to hide the shooting star
    function hideShootingStar() {
        shootingStar.style.display = 'none';
    }

    // Toggle dark mode
    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
    }

    // Show shooting star and toggle dark mode when hovering over the Easter egg container
    easterEgg.addEventListener('mouseenter', function () {
        showShootingStar();
        toggleDarkMode();
    });

    // Hide shooting star and toggle dark mode when mouse leaves the container
    easterEgg.addEventListener('mouseleave', function () {
        hideShootingStar();
        toggleDarkMode();
    });
});

document.addEventListener('DOMContentLoaded', function () {
    const images = document.querySelectorAll('.timelinecontainer img');
    images.forEach(img => {
        console.log('Image src:', img.src);
    });
});
 
 
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