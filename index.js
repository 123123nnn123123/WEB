import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

const program = new Command();

// Налаштування базових відомостей про програму
program
  .name('order-cli')
  .description('CLI-програма для роботи з даними замовлення')
  .version('1.0.0')
  .option('-f, --file <path>', 'шлях до JSON-файлу', './data.json'); // Глобальна опція з файлом за замовчуванням

// Функція для читання та парсингу JSON
function readData(filePath) {
  const resolvedPath = path.resolve(filePath);
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Помилка: Файл за шляхом "${resolvedPath}" не знайдено.`);
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(resolvedPath, 'utf-8');
    return JSON.parse(rawData);
  } catch (err) {
    console.error('Помилка: Файл містить некоректний JSON або його не вдалося прочитати.');
    process.exit(1);
  }
}

// 1. Команда: Перелік (list)
program
  .command('list')
  .description('Показати стислий список товарів у замовленні')
  .option('-l, --limit <number>', 'обмежити кількість товарів', parseInt)
  .action((options) => {
    const opts = program.opts();
    const data = readData(opts.file);
    let items = data.items || [];

    if (options.limit && !isNaN(options.limit)) {
      items = items.slice(0, options.limit);
    }

    console.log(`--- Товари в замовленні ${data.orderId} (Всього: ${items.length}) ---`);
    items.forEach((item, index) => {
      console.log(`${index + 1}. ID: ${item.productId} | Назва: ${item.name} | К-сть: ${item.quantity}`);
    });
  });

// 2. Команда: Один елемент (get)
program
  .command('get')
  .description('Показати повну інформацію про конкретний товар за productId')
  .argument('<productId>', 'ідентифікатор товару (productId)')
  .action((productId) => {
    const opts = program.opts();
    const data = readData(opts.file);
    const item = (data.items || []).find((i) => i.productId === productId);

    if (!item) {
      console.error(`Помилка: Товар з productId "${productId}" не знайдено.`);
      process.exit(1);
    }

    console.log(`--- Детальна інформація про товар ${productId} ---`);
    console.log(JSON.stringify(item, null, 2));
  });

// 3. Команда: Окреме поле (field)
program
  .command('field')
  .description('Показати значення окремого або вкладеного поля (наприклад, customer.email або status)')
  .argument('<fieldPath>', 'шлях до поля через крапку (наприклад: customer.fullName)')
  .action((fieldPath) => {
    const opts = program.opts();
    const data = readData(opts.file);

    const keys = fieldPath.split('.');
    let current = data;

    for (const key of keys) {
      if (current === null || current === undefined || !(key in current)) {
        console.error(`Помилка: Поле "${fieldPath}" відсутнє в замовленні.`);
        process.exit(1);
      }
      current = current[key];
    }

    console.log(`Значення поля "${fieldPath}":`, current);
  });
  program
  .command('items-summary')
  .description('Показати позиції замовлення із розрахованою сумою та можливістю сортування')
  .option('-s, --sort <type>', 'сортування за сумою позиції: asc (зростання) або desc (спадання)')
  .action((options) => {
    const opts = program.opts();
    const data = readData(opts.file);

    let itemsWithSum = (data.items || []).map((item) => {
      const discount = item.discountPercent ? item.discountPercent / 100 : 0;
      const priceWithDiscount = item.price * (1 - discount);
      const totalForItem = priceWithDiscount * item.quantity;
      
      return {
        ...item,
        totalPrice: Number(totalForItem.toFixed(2))
      };
    });

    if (options.sort) {
      if (options.sort === 'asc') {
        itemsWithSum.sort((a, b) => a.totalPrice - b.totalPrice);
      } else if (options.sort === 'desc') {
        itemsWithSum.sort((a, b) => b.totalPrice - a.totalPrice);
      } else {
        console.error('Помилка: Параметр --sort може приймати лише значення "asc" або "desc".');
        process.exit(1);
      }
    }

    console.log(`--- Позиції замовлення ${data.orderId} ---`);
    itemsWithSum.forEach((item) => {
      console.log(
        `- ${item.name} (ID: ${item.productId}): ${item.quantity} шт. x ${item.price} грн` +
        (item.discountPercent ? ` (-${item.discountPercent}%)` : '') +
        ` = Сума: ${item.totalPrice} грн`
      );
    });
  });

// 5. Загальна сума замовлення
program
  .command('total')
  .description('Розрахувати та показати загальну суму замовлення з урахуванням знижок')
  .action(() => {
    const opts = program.opts();
    const data = readData(opts.file);

    const totalAmount = (data.items || []).reduce((sum, item) => {
      const discount = item.discountPercent ? item.discountPercent / 100 : 0;
      const priceWithDiscount = item.price * (1 - discount);
      return sum + priceWithDiscount * item.quantity;
    }, 0);

    console.log(`--- Загальна вартість замовлення ${data.orderId} ---`);
    console.log(`Сума до сплати: ${totalAmount.toFixed(2)} грн`);
  });

// 6. Зведення про доставку й оплату
program
  .command('summary')
  .description('Показати повне зведення про статус замовлення, доставку та оплату')
  .option('--show-notes', 'відобразити примітки до доставки (прапорець)') // Прапорець
  .action((options) => {
    const opts = program.opts();
    const data = readData(opts.file);

    console.log(`=== ЗВЕДЕННЯ ПРО ЗАМОВЛЕННЯ ${data.orderId} ===`);
    console.log(`Статус: ${data.status}`);
    console.log(`Оплачено: ${data.isPaid ? 'Так' : 'Ні'} (Метод: ${data.paymentMethod})`);
    console.log(`Клієнт: ${data.customer.fullName} (${data.customer.phone}, ${data.customer.email})`);
    console.log(`Адреса доставки: м. ${data.shippingAddress.city}, вул. ${data.shippingAddress.street}, буд. ${data.shippingAddress.building}`);
    
    if (options.showNotes) {
      console.log(`Примітки до доставки: ${data.deliveryNotes || 'Відсутні'}`);
    }
  });

// Парсинг аргументів командного рядка (обов'язково в кінці)
program.parse(process.argv);