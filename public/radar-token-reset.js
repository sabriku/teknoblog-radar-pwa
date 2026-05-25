(() => {
  const RESET_KEY = 'tb_radar_token_reset_20260523_1';
  const TOKEN_KEY = 'tb_radar_cron_token';

  try {
    if (localStorage.getItem(RESET_KEY) === '1') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(RESET_KEY, '1');
  } catch (error) {
    console.warn('Radar token reset skipped:', error);
  }
})();
