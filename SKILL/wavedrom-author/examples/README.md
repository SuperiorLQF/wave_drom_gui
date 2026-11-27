# 样例与练习索引

初次使用必须完成全部样例。先读 `lessons/<id>.md` 的需求，独立写到工作目录的 `<id>.attempt.lwf`，保存后才打开参考 LWF 和 JSON；不要把参考答案复制成练习。不要在 examples 内保存练习或改参考答案以消除差异。

`catalog.json` 是完整目录。paired 是带同步时序的 LWF/JSON 对照；syntax 仅教语法，没有时钟，不能据此证明同步通过；native-reference 是旧原生扩展参考，包含 LWF v1 无法精确表达的字段，必须解释其边界。

| ID | 要掌握的内容 | 类型 |
|---|---|---|
| basic | 每格显式值，整数/字符串与 x/z | syntax |
| stable | 相同值合并为延续符，1.... | syntax |
| tasks | 同值任务与交易边界，! | syntax |
| rising-edge | 0→1 才是上升沿，数据在该格变化 | paired |
| wide-clock | 0110 中第二个 1 不是上升沿 | paired |
| icg-gated | 完整脉冲门控，低相更新使能，输出域 | paired |
| clock-div2 | 每个输入上升沿翻转，50% 占空比二分频 | paired |
| ready-valid-sync | 边沿前采样，背压保持和连续传输 | paired |
| axi4-write-sync | 四拍写、D2 背压、WLAST、B 响应 | paired |
| intentional-glitches | 1111/1... 图形差异 | native-reference |
| ready-valid | 原生 p、phase 与真实采样时间 | native-reference |
| request-ack | 原生节点和箭头 | native-reference |
| task-boundaries | 重复电平任务边界与节点箭头 | native-reference |

## 边沿定义与对照答案

以下单行数组只是教学表，实际 LWF 仍然每行一个值。

```text
格号       0 1 2 3 4 5 6 7 8 9 10 11
CLK        0 1 0 1 0 1 0 1 0 1  0  1
上升沿       ↑   ↑   ↑   ↑   ↑     ↑
Q          0 0 0 1 1 1 1 1 1 0  0  0
```

严格定义：t>0 且 CLK[t-1]=0、CLK[t]=1。Q 在格 3 和 9 改变，均为上升沿，之间保持。不是“只要当前为 1 就可以改”。若 CLK=0110，仅格 1 是上升沿，格 2 仍为高电平，没有新边沿。第 0 格是初值，不能断言窗口前为 0。

反例（只用于找错，禁止作为通过门禁的波形生成）：CLK=0110、Q=0011。Q 在格 2 改变，但 CLK 从 1 到 1；必须停止并修正原稿或查明真实设计，不能报同步 PASS。

## ICG 门控与触发器分频

ICG（Integrated Clock Gating，集成时钟门控）通常在输入低电平期间锁存使能，再用该使能控制是否通过完整时钟脉冲。原始 EN 可以有自己的来源；本例的 ICG_EN 是已经锁存的有效使能，只在低相边界变化，不是普通上升沿数据线。

```text
CLK_IN      0101010101010101
ICG_EN      1100110011001100
CLK_GATED   0100010001000100
CLK_DIV2    0110011001100110
```

ICG 输出跳过交替输入脉冲；从第一个高电平开始观察就是 `10001000…`，频率降低但高电平宽度仍为一个格。输出下降沿跟随输入下降沿。没有放行的输入上升沿不允许 Q_GATED 更新。

触发器二分频在每个输入上升沿翻转输出：输出上升沿和下降沿都由输入上升沿触发，高低相各两个格。从不同相位看可写为 `00110011…`，不能误用“高电平必须包含在父时钟高相内”的 ICG 规则检查它。

二者的输出域上升沿在本例恰好相同（1、5、9、13），但下降沿和占空比不同。门控不一定周期性，只有有规律地选择脉冲时才表现出规律的降频；真实分频器也不全是本例这种二分频结构。

## 采样与输出更新

每格记录边界后的状态。寄存器在上升沿读取边沿前值，再更新输出。ready-valid-sync 中格 5 才拉高 READY，因此格 5 没有握手；格 7 采到旧的 VALID=READY=1，才接收 A，随后 DATA 更新为 B。格 9 接收 B 后撤销 VALID。图中与边沿对齐的变化不代表同沿的新值已被接收。

AXI 示例的采样事件：AW=11；D0/D1/D2/D3=13/15/21/23；D2 在17/19等待；B=29。图内 x 只是无效负载窗口不关心值，不是实测 X。

## 比对

从 skill 目录执行：

```bash
node scripts/study.cjs audit
node scripts/study.cjs compare rising-edge /path/to/rising-edge.attempt.lwf
node scripts/test-examples.cjs
```

比对忽略注释、空行和信号排列，逐项比较名称、类型、格值、状态/标签和 !。失败时先解释误解再修正自己的原稿，重新检查；参考原稿本身疑似有错时记录问题，不自动改库。原生扩展案例不强求不支持的 LWF 等价性，须提交解释和可表达部分。
