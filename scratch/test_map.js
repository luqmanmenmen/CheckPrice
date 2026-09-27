const map = new Map();
map.set('A', { val: 0 });
const obj = map.get('A');
obj.val = 10;
console.log(map.get('A').val);
