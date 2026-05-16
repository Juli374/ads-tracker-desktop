#!/bin/bash
cd "$(dirname "$0")"

# Source owner-build env shortcuts if the operator created one. Template at
# local-env.sh.example. Holds ADS_TRACKER_PERSONAL_TOKEN, ADS_TRACKER_FORCE_TIER,
# etc. — kept out of git so the token never ships to the public.
if [ -f ./local-env.sh ]; then
  # shellcheck disable=SC1091
  source ./local-env.sh
fi

clear
echo "Запускаю Ads Tracker в режиме разработки..."
echo "Окно приложения откроется через 10-20 секунд."
echo "Чтобы остановить — закрой окно или нажми Ctrl+C в этом терминале."
echo ""
npm start
