const toggleBtn = document.getElementById('toggle-mode');
const icon = toggleBtn.querySelector('i');

// Carrega o modo salvo no localStorage
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.remove('dark-mode');
    icon.classList.replace('fa-moon', 'fa-sun');
}

toggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');

    if (document.body.classList.contains('dark-mode')) {
        icon.classList.replace('fa-sun', 'fa-moon');
        localStorage.setItem('theme', 'dark');
    } else {
        icon.classList.replace('fa-moon', 'fa-sun');
        localStorage.setItem('theme', 'light');
    }
});
