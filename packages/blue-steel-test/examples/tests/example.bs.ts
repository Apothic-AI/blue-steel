import { test } from 'blue-steel-test';

// Learn more about building test case:
// https://docs.blue-steel.run/core-concepts/building-test-cases

const sampleTodos = [
    "Take out the trash",
    "Buy groceries",
    "Build more test cases with BlueSteel"
];

test('can add and complete todos', { url: 'https://magnitodo.com' }, async (agent) => {
    await agent.act('create 3 todos', { data: sampleTodos.join(', ') });
    await agent.check('should see all 3 todos');
    await agent.act('mark each todo complete');
    await agent.check('says 0 items left');
});
