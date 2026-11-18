<p align="center">
  <img src="icon/out/UpupuCalc-icon.png" width="112" alt="UpupuCalc">
</p>

<h1 align="center">UpupuCalc</h1>

<p align="center">
  <a href="#english">English</a> · <a href="https://t.me/UpupuCalc">Telegram-канал</a> · <a href="https://github.com/Ragelm/UpupuCalc/releases">Скачать</a>
</p>

## Описание

**UpupuCalc** это не официальный калькулятор гачи по проекту **Shinri Trial**. Он способен рассчитать вероятность желаемого события и помочь спланировать свои траты и накопления.

## Какие имеет возможности?

- Расчёт точного шанса получения выбранного предмета/предметов за заданное число круток, виртуальной или реальной валюты
- Сравнение изменение шансов благоприятного исхода наглядно на графиках
- Разделение на два вида гачи: с дубликатами или без
- Учёт в шансах после использования "сургуча вмешательства"
- Автоматический подсчёт и перевод всех имеющихся валют в "письма" для круток
- Создание, изменение и удаление баннеров и их содержимого
- 2 готовых шаблона постоянных баннеров: «Первый Штрих» и «Первая Соната»
- Система таймера до конца баннера и расчёта накопленной валют с ежедневных заданий и пропуска поддержки за пройденное время
- Автоматическое начисление валюты по серверному времени. В учёт идёт часовой пояс пользователя
- Расчёт самого покупки дешёвого доната для гарантированного выбивания награды
- Учёт двойных наград при покупке игровой валюты и наборов покупаемых в магазинах
- Возможность добавлять покупные свои наборы на случай акций или ивентов (+ добавлены которые доступны всем с самого начала)
- Поддержка цен ru и Global сервера
- Сохранение, импорт/экспорт настроек программы
- Пояснения к ко всему функционалу программы, советы

## В планах
- Добавить поддержку расчёта выбивания "Абсолютного" скина, как только появится первый баннер с ним

## Как запустить

1. Скачайте `UpupuCalc.exe` со страницы [Releases](https://github.com/Ragelm/UpupuCalc/releases).
2. Запустите. Установка не нужна.

## Примечания к запуску

Нужна Windows 10 или 11: окно рисуется встроенным компонентом WebView2.
Если у вас более устаревшая Windows, программу можно запустить через браузер:
1. Щёлкните по UpupuCalc.exe правой кнопкой → «Создать ярлык».
2. Правой кнопкой по ярлыку → «Свойства».
3. В поле «Объект» допишите в конце через пробел --browser, чтобы получилось примерно так:
 "C:\Games\UpupuCalc\UpupuCalc.exe" --browser
4. «ОК». Теперь этот ярлык будет открывать программу во вкладке браузера по умолчанию.

Файл не подписан цифровой подписью, поэтому при первом запуске Windows может показать предупреждение SmartScreen: «Подробнее» → «Выполнить в любом случае».

## Следы в системе

- Настройки хранятся в одном файле `UpupuCalc.settings.json` рядом с exe. Удалите его вместе с программой – и ничего не останется.
- Программа ничего не устанавливает и не пишет в реестр.
- Служебная папка окна создаётся во временной папке Windows и удаляется при закрытии.
- Программа не читает и не изменяет данные других программ и игр и работает полностью офлайн. Для своего окна она слушает только локальный адрес `127.0.0.1`. Ссылки из подсказок открываются в обычном браузере и только на `boosty.to`, `github.com`, `t.me` и `kirigiris.press`.

## Сборка из исходников

Нужен [Go](https://go.dev/dl/) 1.21 или новее. Все библиотеки лежат в `vendor/`, интернет для сборки не нужен.

```bat
build.bat
```

или вручную:

```bash
go build -mod=vendor -trimpath -ldflags "-s -w -H windowsgui" -o UpupuCalc.exe .
```

## Структура

| Путь | Что там |
|---|---|
| `ui/core.js` | расчёты: Box-гача, Flat-rate гача, экономика, подбор покупки, шаблоны баннеров |
| `ui/i18n.js` | все тексты интерфейса на русском и английском |
| `ui/app.js`, `app.css`, `index.html` | интерфейс |
| `ui/links.js` | ссылки автора |
| `ui/img/` | иконки валют и снимки экрана для подсказки |
| `main*.go` | оболочка: окно программы и сохранение настроек |
| `test/test.js` | тесты расчётов |
| `icon/`, `winres/` | значок и сведения о файле |
| `vendor/` | библиотеки Go |

## Лицензия и авторство

Исходный код и идею проекта можно свободно использовать, изменять и распространять без разрешения автора. Проект изначально создавался для личного использования, но впоследствии был доработан для всех желающих.

Это разрешение не распространяется на чужие материалы в репозитории: иконки валют и снимки экрана принадлежат авторам Shinri Trial, шрифт Montserrat распространяется по лицензии [SIL Open Font License](ui/font-license.txt).


<a id="english"></a>
# English

## Description

**UpupuCalc** is an unofficial gacha calculator for **Shinri Trial**. It calculates the probability of the outcome you want and helps you plan your spending and savings.

## Features

- Exact chance of getting the chosen item(s) for a given number of pulls, in-game currency or real money
- Charts that show how the odds of a good outcome change
- Two gacha modes: with duplicates or without
- Odds that account for using the "Intervention Seal"
- Automatic conversion of all your currencies into "letters" for pulls
- Create, edit and delete banners and their contents
- 2 ready-made templates for the permanent banners: "First Stroke" and "First Sonata"
- Banner countdown timer, plus a calculation of currency earned from daily quests and the Support Pass over the elapsed time
- Automatic currency accrual by server time, adjusted to the user's time zone
- Finds the cheapest top-up that guarantees the reward
- Accounts for double rewards on currency purchases and store bundles
- Add your own purchasable bundles for sales and events (the bundles available to everyone from the start are already included)
- Support for RU and Global server pricing
- Save, import and export your settings
- Explanations and tips for every feature

## Planned
- Add drop-rate calculation for the "Ultimate" skin once the first banner featuring it is released

## How to run

1. Download `UpupuCalc.exe` from the [Releases](https://github.com/Ragelm/UpupuCalc/releases) page.
2. Run it. No installation needed.

## Launch notes

Requires Windows 10 or 11: the window is rendered by the built-in WebView2 component.
On older Windows versions you can run the program in your browser instead:
1. Right-click UpupuCalc.exe → "Create shortcut".
2. Right-click the shortcut → "Properties".
3. In the "Target" field, add a space and --browser at the end, so it looks something like this:
 "C:\Games\UpupuCalc\UpupuCalc.exe" --browser
4. Click "OK". This shortcut will now open the program in a tab of your default browser.

The file is not digitally signed, so Windows SmartScreen may show a warning on first launch: "More info" → "Run anyway".

## Footprint

- Settings are stored in a single `UpupuCalc.settings.json` file next to the exe. Delete it together with the program and nothing is left behind.
- The program installs nothing and doesn't write to the registry.
- The window's working folder is created in the Windows temp folder and deleted on exit.
- The program doesn't read or modify data of other programs or games and works fully offline. For its own window it listens only on the local address `127.0.0.1`. Links from tooltips open in your regular browser and only lead to `boosty.to`, `github.com`, `t.me` and `kirigiris.press`.

## Building from source

Requires [Go](https://go.dev/dl/) 1.21 or newer. All libraries are in `vendor/`, so no internet connection is needed to build.

```bat
build.bat
```

or manually:

```bash
go build -mod=vendor -trimpath -ldflags "-s -w -H windowsgui" -o UpupuCalc.exe .
```

## Project structure

| Path | Contents |
|---|---|
| `ui/core.js` | calculations: Box gacha, Flat-rate gacha, economy, purchase optimizer, banner templates |
| `ui/i18n.js` | all interface text in Russian and English |
| `ui/app.js`, `app.css`, `index.html` | interface |
| `ui/links.js` | author's links |
| `ui/img/` | currency icons and screenshots for the help tooltips |
| `main*.go` | shell: program window and settings storage |
| `test/test.js` | calculation tests |
| `icon/`, `winres/` | icon and file metadata |
| `vendor/` | Go libraries |

## License and credits

The source code and the idea of the project may be freely used, modified and distributed without the author's permission. The project was originally made for personal use and later polished for anyone who wants it.

This permission does not cover third-party materials in the repository: the currency icons and screenshots belong to the authors of Shinri Trial, and the Montserrat font is distributed under the [SIL Open Font License](ui/font-license.txt).
