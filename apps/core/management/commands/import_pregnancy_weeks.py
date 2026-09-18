# -*- coding: utf-8 -*-
"""导入怀孕40周结构化时间轴数据

用法：
  python manage.py import_pregnancy_weeks          # 导入全部40周数据
  python manage.py import_pregnancy_weeks --clear   # 先清空旧孕期周数据再导入
"""
import json

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.core.models import TimelineEvent


# ===================== 数据定义 =====================
# 每条数据字段: stage_type, stage_value, category, title, subtitle, content, tips, is_essential, sort_order

WEEKLY_DATA = [
    # ==================== 孕1月（1~4周） ====================
    # --- 第1周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 1, "category": "milestone",
        "title": "生命的开端：受精卵形成", "subtitle": "孕1周·胎儿发育",
        "content": "此时还未真正怀孕，这是末次月经开始计算的第1周。身体正在为排卵做准备，卵子在卵巢中发育成熟。备孕期间，夫妻双方应保持健康生活方式，戒烟戒酒，避免接触有害物质。",
        "tips": "从现在开始每天补充叶酸400μg，预防胎儿神经管畸形。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 1, "category": "food",
        "title": "孕前营养储备：叶酸先行", "subtitle": "孕1周·营养重点",
        "content": "备孕期每日补充叶酸400μg，持续至孕12周。多吃富含叶酸的食物：菠菜、芦笋、豆类、动物肝脏。同时保证优质蛋白质摄入，为受孕做好营养储备。",
        "tips": "叶酸补充剂比食物吸收率更高，建议药补+食补双管齐下。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 1, "category": "health",
        "title": "远离致畸环境和物质", "subtitle": "孕1周·生活护理",
        "content": "备孕期就应远离：X射线等放射性物质、化学有毒物质（铅、汞、苯）、新装修环境、高温环境（桑拿、温泉）。避免接触猫狗粪便（弓形虫风险）。切勿随意用药。",
        "tips": "家里养猫的，备孕期起由他人清理猫砂。",
        "is_essential": True, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 1, "category": "education",
        "title": "情绪胎教：保持愉悦期待", "subtitle": "孕1周·胎教建议",
        "content": "备孕期间保持心情放松，过度焦虑反而影响受孕。可以和伴侣一起憧憬未来，阅读育儿书籍，做一些轻松的运动如散步、瑜伽，为迎接新生命做好心理准备。",
        "tips": "夫妻双方一起参与备孕准备，有助于增进感情。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第2周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 2, "category": "milestone",
        "title": "排卵与受精：生命之吻", "subtitle": "孕2周·胎儿发育",
        "content": "本周期排卵发生，精子和卵子在输卵管相遇完成受精。受精卵开始分裂：30小时后变成2个细胞，然后4个、8个……逐渐形成桑葚胚，向子宫移动。",
        "tips": "排卵期同房后不要立刻起身，平躺15-20分钟有助受孕。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 2, "category": "food",
        "title": "优质蛋白质：生命的基础物质", "subtitle": "孕2周·营养重点",
        "content": "受精卵着床需要充足营养。多摄入优质蛋白：鸡蛋、牛奶、鱼肉、豆制品。维生素和矿物质同样重要，多吃新鲜蔬果、全谷物。继续补充叶酸。",
        "tips": "蛋白质每天摄入量建议80克左右，注重质量而非数量。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 2, "category": "health",
        "title": "确定一家称心的产检医院", "subtitle": "孕2周·生活护理",
        "content": "提前考察并确定产检医院：离家距离适中、产科口碑好、有新生儿科。了解建档流程和要求，准备好身份证、户口本、结婚证等材料。建档一般在孕6-8周。",
        "tips": "热门医院建档名额紧张，确定怀孕后第一时间预约。",
        "is_essential": True, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 2, "category": "education",
        "title": "环境胎教：打造舒适居家环境", "subtitle": "孕2周·胎教建议",
        "content": "居室色彩温柔清新，采用乳白、淡蓝、淡绿等色调。保持室内空气清新，远离装修污染。室温夏季27-28℃，冬季16-18℃，湿度30%-40%。为宝宝到来营造温馨的家。",
        "tips": "室内外温差不超过5℃，避免感冒。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第3周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 3, "category": "milestone",
        "title": "着床：受精卵安家子宫", "subtitle": "孕3周·胎儿发育",
        "content": "受精卵经过数天旅行到达子宫，像一颗小小的种子植入子宫内膜，这个过程称为着床。胚胎开始分泌HCG激素，这就是后来验孕棒能测到的物质。此时胚胎只有针尖大小。",
        "tips": "着床时可能有轻微出血（着床出血），属正常现象，量少且短暂。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 3, "category": "food",
        "title": "钙磷锌铜：骨骼与神经发育基础", "subtitle": "孕3周·营养重点",
        "content": "胎宝宝骨骼和牙齿发育需要充足的钙和磷。锌、铜元素亦不可少，缺锌缺铜可导致胎儿骨骼、内脏及脑神经发育不良。多喝牛奶、吃豆制品、坚果、深色蔬菜。",
        "tips": "钙的吸收需要维生素D辅助，适当晒太阳有助合成。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 3, "category": "health",
        "title": "千万不要随意用药", "subtitle": "孕3周·疾病预警",
        "content": "孕早期是胎儿器官分化敏感期，很多药物可致畸。感冒发烧不要自行吃药，需在医生指导下用药。如必须用药，告知医生可能已怀孕。退烧可用物理降温。",
        "tips": "就医时主动告知医生备孕/怀孕状态，避免开孕妇禁用药物。",
        "is_essential": True, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 3, "category": "education",
        "title": "营养胎教：为子宫骄傲", "subtitle": "孕3周·胎教建议",
        "content": "子宫是胎宝宝最温暖的房子。从受精卵着床起，子宫开始膨胀蓄积羊水，到孕末期体积将增大近1000倍。孕妈妈需保证睡眠充足、饮食均衡、饮水适量，给胎宝宝最好的生长环境。",
        "tips": "怀着愉悦的心情就是对胎宝宝最好的胎教。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第4周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 4, "category": "milestone",
        "title": "三胚层形成：身体的蓝图", "subtitle": "孕4周·胎儿发育",
        "content": "胚胎细胞分化形成\"三胚层\"，每一层将发育成不同的器官系统：外胚层→皮肤、神经系统；中胚层→肌肉、骨骼、心血管；内胚层→消化系统、呼吸系统。神经系统和循环系统最先开始分化。胚胎约4毫米，像小海马，不到1克。",
        "tips": "此时期是致畸最高敏感期（孕3-8周），务必远离有害环境。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 4, "category": "food",
        "title": "孕早期饮食调节：清淡为先", "subtitle": "孕4周·营养重点",
        "content": "可能出现轻微恶心等早孕反应，饮食以清淡、易消化为主。早餐可吃烤馒头片或苏打饼干缓解不适。多吃蔬菜水果补充维生素，适当增加优质蛋白。拒绝刺激性食物，不喝碳酸饮料。",
        "tips": "恶心时可吃干的食物，不恶心时喝稀汤，有助于缓解早孕反应。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 4, "category": "health",
        "title": "出现腹痛腹胀要倍加小心", "subtitle": "孕4周·疾病预警",
        "content": "孕早期腹痛分生理性和病理性。生理性腹痛较轻微，是子宫增大牵拉韧带所致。病理性腹痛需警惕先兆流产和宫外孕：下腹剧痛、伴阴道出血应立即就医。不要盲目卧床\"保胎\"，及时检查才安全。",
        "tips": "生理性腹痛可喝姜糖水暖胃缓解；任何剧烈或持续腹痛都要就医。",
        "is_essential": True, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 4, "category": "health",
        "title": "洗澡细节：水温时间都要注意", "subtitle": "孕4周·生活护理",
        "content": "水温不宜过高，控制在42℃以下，高温可致胎儿神经发育受损。每次洗澡不超过15分钟，避免头晕缺氧。不宜坐浴，脏水进入阴道易引起感染。以淋浴为佳。",
        "tips": "浴室保持通风，防滑垫是必备品。",
        "is_essential": False, "sort_order": 4,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 4, "category": "education",
        "title": "情绪胎教：保持稳定心情", "subtitle": "孕4周·胎教建议",
        "content": "孕早期情绪波动大，焦虑和担忧很正常。多读爱读的书，做喜欢的事，分散对不适的注意力。忌大悲大喜，情绪不稳定可能影响胎儿神经发育。和伴侣分享感受，获得支持。",
        "tips": "意外受孕不必过度担心，少量饮酒或常用药物在着床前一般无大碍，但需咨询医生。",
        "is_essential": False, "sort_order": 5,
    },

    # ==================== 孕2月（5~8周） ====================
    # --- 第5周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 5, "category": "milestone",
        "title": "小胚胎开始发育了", "subtitle": "孕5周·胎儿发育",
        "content": "胚胎一旦植入子宫便开始分泌激素，这才让你感到胃口不适。胚胎细胞分化形成三胚层，神经系统和循环系统基础组织最先开始分化。小胚胎只有苹果子那么大，外观像\"小海马\"，约4毫米，不到1克。",
        "tips": "验孕棒此时可测出阳性，建议去医院抽血查HCG确认。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 5, "category": "food",
        "title": "蛋白质是构成生命的基础物质", "subtitle": "孕5周·营养重点",
        "content": "胚胎不能自身合成氨基酸，必须由妈妈供给。孕吐反应可能不喜欢动物蛋白，可用豆制品、花生酱、芝麻酱等植物蛋白替代。不喝牛奶可用酸奶、豆浆替代。继续补充叶酸和多种维生素。",
        "tips": "干果不仅补充矿物质，还含必需脂肪酸，有利于胎儿大脑发育。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 5, "category": "health",
        "title": "夫妻性生活要格外小心", "subtitle": "孕5周·生活护理",
        "content": "孕早期（前3个月）胎盘未完全形成，胎儿不稳定，不宜性交。可考虑拥抱、亲吻等温和方式。有习惯性流产史、高龄初产者整个孕期应禁止性生活。孕期同房最好使用避孕套。",
        "tips": "精液中前列腺素可促使子宫收缩，可能引起腹痛甚至流产。",
        "is_essential": True, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 5, "category": "education",
        "title": "为你的子宫骄傲", "subtitle": "孕5周·胎教建议",
        "content": "子宫在排卵前就开始增厚，如同妈妈为未谋面的孩子铺好床。从受精卵到足月，子宫体积增长近1000倍，完成后仅需6周恢复原状——人体没有其他器官有此变化。怀着愉悦心情给胎宝宝温暖",
        "tips": "睡眠充足、饮食均衡、饮水适量是子宫工作的重要保障。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第6周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 6, "category": "milestone",
        "title": "B超可以测到胎宝宝的心跳了", "subtitle": "孕6周·胎儿发育",
        "content": "胚胎迅速成长，各种器官均已出现，结构和功能还不完善。小心脏开始有规律地跳动！胚胎长约0.6厘米，像小松子仁，初级肾和心脏等主要器官已形成，神经管连接大脑和脊髓，四肢出现为不规则的\"胎芽\"。",
        "tips": "孕6周B超可见胎心搏动，这是确认胚胎存活的重要指标。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 6, "category": "food",
        "title": "应对早孕反应的饮食策略", "subtitle": "孕6周·营养重点",
        "content": "早孕反应来袭：恶心、呕吐、食欲不振。晨起在床边备水、面包或水果，抑制恶心。吃干食品（饼干、烤面包）减轻呕吐，稀饭补充水分。少食多餐，避免空腹。注意水和电解质平衡，剧烈呕吐需就医。",
        "tips": "蛋白质每日80克为宜，不必追求数量，注重质量。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 6, "category": "health",
        "title": "积极应对早孕反应", "subtitle": "孕6周·疾病预警",
        "content": "早孕反应一般在第6周出现、9-11周最重、12周左右自行缓解。大多数孕妈能耐受，无须特殊治疗。如呕吐剧烈无法进食进水（妊娠剧吐），需输液补充营养和电解质。阴道出血应立即去医院排除宫外孕。",
        "tips": "早孕反应与HCG水平相关，HCG越高反应越重，双胎反应更明显。",
        "is_essential": True, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 6, "category": "education",
        "title": "温柔的诗篇：情绪胎教", "subtitle": "孕6周·胎教建议",
        "content": "本月胎教以情绪胎教为主：保持情绪稳定、心情愉悦，忌大悲大喜。营养胎教为辅：即便吐了也吃些爽口蔬果、蛋羹汤粥。可开始尝试运动胎教和音乐胎教——适当运动和听音乐辅助调节情绪。与小小的他分享心情，算是胎教预习。",
        "tips": "胎宝宝现在是胚胎，各种感觉还未发育，不必急于正式胎教课程。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第7周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 7, "category": "milestone",
        "title": "聪明应对日益明显的早孕反应", "subtitle": "孕7周·胎儿发育",
        "content": "胚胎持续快速发育，各种器官不断完善。大脑和神经系统中枢继续发育，心脏已分化为左右心房和心室。面部特征开始形成，眼睛、鼻子、嘴巴的雏形出现。四肢的胎芽更加明显。",
        "tips": "此时期是大脑发育关键期，孕妈妈情绪直接影响胎儿神经发育。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 7, "category": "food",
        "title": "吃酸有讲究：酸儿辣女不可靠", "subtitle": "孕7周·营养重点",
        "content": "\"酸儿辣女\"没有科学依据。孕期喜酸是正常现象，胃酸分泌减少导致。吃酸有讲究：选择酸奶、西红柿、橘子等天然酸味食物，避免山楂（可能促进子宫收缩）。人工腌制的酸味食物含亚硝酸盐，不宜食用。",
        "tips": "酸奶既补充蛋白质又提供益生菌，是孕期理想食品。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 7, "category": "health",
        "title": "孕妈妈万一感冒了怎么办", "subtitle": "孕7周·疾病预警",
        "content": "孕期感冒以休息、多喝水为主。轻度发烧（38℃以下）可用物理降温。高烧需就医，持续高温可能致畸。不要自行服用感冒药、退烧药。咳嗽剧烈可喝蜂蜜水、冰糖梨水缓解。预防：勤洗手、避免去人多场所。",
        "tips": "流感季节可接种流感疫苗（孕期安全）。",
        "is_essential": True, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 7, "category": "education",
        "title": "提高胎教效果的呼吸法", "subtitle": "孕7周·胎教建议",
        "content": "练习 deep breathing 呼吸法增强胎教效果：身体放松，端坐或仰卧，缓慢吸气4秒→屏息4秒→缓慢呼气4秒。每天早晚各做10分钟。不仅能放松身心、稳定情绪，还能增加血液含氧量，有利于胎儿发育。",
        "tips": "呼吸法也是分娩时的有用技巧，现在练习一举两得。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第8周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 8, "category": "milestone",
        "title": "胚胎进入快速发育期", "subtitle": "孕8周·胎儿发育",
        "content": "胚胎进入快速发育期，所有主要器官和系统都已形成并开始运作。手指和脚趾开始出现，面部特征更加清晰，尾巴逐渐消失。骨骼开始变硬。胚胎长约1.6厘米，重量约1克。B超可清晰看到胎心搏动。",
        "tips": "孕8周是建档关键期，尽快完成初次产检建档。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 8, "category": "food",
        "title": "让孕妈妈心情愉快的食物", "subtitle": "孕8周·营养重点",
        "content": "某些食物有助于改善情绪：香蕉（富含色氨酸→血清素→快乐）、全麦面包（B族维生素稳情绪）、牛奶（钙有助放松）、深海鱼（Omega-3益大脑）。禁食不利安胎的食物：山楂、薏米、马齿苋、螃蟹等。",
        "tips": "晨起先吃几粒花生米或苏打饼干再起身，可有效抑制晨吐。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 8, "category": "checkup",
        "title": "孕早期建档 + 初次正式产检", "subtitle": "孕8周·产检项目",
        "content": "孕6-8周是建档关键期。首次产检项目包括：HCG和孕酮检测确认妊娠、B超确认宫内孕及胎心搏动、血常规（贫血检测）、尿常规、乙肝五项、肝功能、血型检测（ABO+Rh）、优生四项（弓形虫/风疹/巨细胞/疱疹病毒）。",
        "tips": "建档一般需身份证+户口本+结婚证，不同医院要求不同，提前电话确认。",
        "is_essential": True, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 8, "category": "health",
        "title": "了解先兆流产和宫外孕", "subtitle": "孕8周·疾病预警",
        "content": "先兆流产：阴道少量出血伴下腹隐痛，需及时就医保胎。宫外孕：受精卵着床在子宫外（多为输卵管），表现为停经后不规则出血和剧烈腹痛，破裂可致大出血危及生命，需立即手术。B超是鉴别宫内孕和宫外孕的关键。",
        "tips": "孕早期任何阴道出血都应立即就医，不要自行判断。",
        "is_essential": True, "sort_order": 4,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 8, "category": "education",
        "title": "想象胎宝宝出生后可爱的样子", "subtitle": "孕8周·胎教建议",
        "content": "每天花几分钟想象宝宝的模样：是像妈妈的大眼睛，还是爸爸的高鼻梁？想象抱着他/她的温暖感觉。这种积极的想象能促进孕妈妈分泌内啡肽，通过胎盘传递给胎宝宝，有益于其大脑和情绪发育。也可以开始给宝宝写日记。",
        "tips": "准备一本孕期日记本，记录每天的感受和对宝宝说的话。",
        "is_essential": False, "sort_order": 5,
    },

    # ==================== 孕3月（9~12周） ====================
    # --- 第9周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 9, "category": "milestone",
        "title": "进入胎儿期：从胚胎到胎儿", "subtitle": "孕9周·胎儿发育",
        "content": "从本周起正式称为\"胎儿\"而非\"胚胎\"。胎儿约2.3厘米，约2克重。所有主要器官已初步形成，开始进入功能完善阶段。尾巴完全消失，头部仍然很大占身体一半。手指和脚趾明显可见，四肢可微动。",
        "tips": "度过致畸最高敏感期，但仍需注意用药安全。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 9, "category": "food",
        "title": "多吃有利胎宝宝发育的食物", "subtitle": "孕9周·营养重点",
        "content": "健脑食物：核桃、花生（不去红衣）、芝麻、豆类、海鱼、鹌鹑、黑木耳、小米。这些食物富含卵磷脂、脑磷脂、不饱和脂肪酸，促进胎儿大脑发育。猕猴桃富含维生素C和叶酸。继续保持少食多餐，应对早孕反应。",
        "tips": "核桃每天3-5个即可，过量易上火。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 9, "category": "health",
        "title": "孕早期疲惫嗜睡如何应对", "subtitle": "孕9周·生活护理",
        "content": "孕激素升高导致嗜睡疲倦，这是身体在保护胎儿。应对方法：每天保证8-9小时睡眠，午休30分钟。不要勉强自己高效率，适当放慢节奏。工作时每隔1小时站起来走动。穿着宽松舒适，不要穿高跟鞋。",
        "tips": "嗜睡通常在孕12周后逐渐缓解，坚持一下！",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 9, "category": "education",
        "title": "有趣的胎教故事", "subtitle": "孕9周·胎教建议",
        "content": "给胎宝宝讲故事，不需要他\"听懂\"，重要的是妈妈温柔的声音。选择情节简单、温暖的童话故事，如《小蝌蚪找妈妈》《龟兔赛跑》。每天固定时间读10-15分钟。孕妈妈的声音通过骨传导到达子宫，胎儿能感受到声音的韵律。",
        "tips": "准爸爸也参与讲故事，胎儿会对爸爸低沉的声音产生记忆。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第10周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 10, "category": "milestone",
        "title": "度过流产危险期，宝贝安全了！", "subtitle": "孕10周·胎儿发育",
        "content": "胎儿约3.1厘米，约4克重。大脑发育迅速，每分钟产生数万个神经元。心脏跳动有力，约170次/分。主要器官已全部形成，此后进入生长和功能完善期。流产风险大幅降低，可以稍微松口气了。",
        "tips": "孕10周后流产风险显著下降，但仍需注意避免剧烈运动。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 10, "category": "food",
        "title": "合理饮食，避免便秘或腹泻", "subtitle": "孕10周·营养重点",
        "content": "孕激素使肠道蠕动减慢，容易便秘。多吃富含纤维的食物：全麦面包、燕麦、芹菜、红薯、火龙果。每天喝水1500ml以上。禁食不利安胎的食物。腹泻时要及时补充水分和电解质，持续腹泻需就医。",
        "tips": "早晨空腹喝一杯温开水，有助于促进肠道蠕动。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 10, "category": "health",
        "title": "慎选护肤品和化妆品", "subtitle": "孕10周·生活护理",
        "content": "孕期皮肤敏感，慎选护肤：避免含维A酸、水杨酸、对苯二酚的产品。可以用的：成分简单的保湿霜、防晒霜。不用口红（含铅可能被舔食），不用指甲油（挥发性溶剂有害）。如需化妆，选择孕妇专用品牌。",
        "tips": "孕期容易长妊娠斑，做好防晒比美白更重要。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 10, "category": "emotion",
        "title": "情绪不良可能导致孩子多动症", "subtitle": "孕10周·心理情绪",
        "content": "研究表明，孕期长期焦虑、抑郁可能影响胎儿神经发育，与儿童多动症、情绪问题有关联。情绪低落时试试：散步、听音乐、与好友聊天、写日记。如持续两周以上情绪低落，寻求专业帮助。",
        "tips": "孕期抑郁不是矫情，是真实的激素变化引起的，需要被理解。",
        "is_essential": True, "sort_order": 4,
    },
    # --- 第11周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 11, "category": "milestone",
        "title": "胎儿有草莓那么大了", "subtitle": "孕11周·胎儿发育",
        "content": "胎儿约4.1厘米，约7克重，大小如草莓。开始有人形了：头大但比例逐渐协调，手指脚趾清晰分开，指甲开始生长。胎儿已能在羊水中活动，只是动作轻微，妈妈还感觉不到。骨骼逐渐变硬。",
        "tips": "NT检查最佳时间窗口为孕11周-13周+6天，可以开始预约了。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 11, "category": "exercise",
        "title": "不要当宅妈，适当保持有氧运动", "subtitle": "孕11周·运动建议",
        "content": "适度运动对孕妈和胎宝宝好处多多：改善情绪、控制体重、增强体力为分娩做准备。推荐：散步（每天30分钟）、孕妇瑜伽、游泳。避免：跳跃、碰撞、高海拔运动。运动时心率不超过140，能正常说话为度。",
        "tips": "运动前后各喝一杯水，穿舒适的运动鞋。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 11, "category": "health",
        "title": "尿频和妊娠牙龈炎的应对", "subtitle": "孕11周·疾病预警",
        "content": "尿频是子宫增大压迫膀胱所致，正常生理反应，不要憋尿。妊娠牙龈炎：激素变化导致牙龈充血易出血，用软毛牙刷、温盐水漱口。孕早期便秘：多吃纤维食物、多喝水、适度运动，必要时可用乳果糖。",
        "tips": "尿频通常在孕中期子宫出盆腔后缓解，孕晚期因入盆会再次出现。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第12周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 12, "category": "milestone",
        "title": "第一次正式B超检查", "subtitle": "孕12周·胎儿发育",
        "content": "胎儿约6厘米，约14克重。面部特征清晰，已有吸吮反射。外生殖器开始分化。胎盘完全形成并接管激素分泌，早孕反应开始减轻。B超可核对胎龄、测量NT值、观察胎儿结构。",
        "tips": "12周时早孕反应逐渐缓解，食欲开始恢复。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 12, "category": "checkup",
        "title": "NT检查（颈项透明层）", "subtitle": "孕12周·产检项目",
        "content": "NT检查在孕11周-13周+6天进行，通过B超测量胎儿颈项透明层厚度。正常值 <2.5mm。NT偏厚需进一步检查：无创DNA或羊水穿刺。同时进行首次正式产检：血压、体重、宫高、胎心、血常规、尿常规等。",
        "tips": "NT检查需提前预约，检查时不需要憋尿。带上建档资料。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 12, "category": "food",
        "title": "鱼肝油和含钙食品要慎重服用", "subtitle": "孕12周·营养重点",
        "content": "鱼肝油含大量维生素A，过量可致胎儿畸形，孕期慎用。补钙不宜过量，每日推荐1000mg，过量可能造成胎盘钙化。从食物中获取最安全：牛奶、豆腐、虾皮、芝麻酱。补钙同时注意维生素D的摄入（晒太阳）。",
        "tips": "慎食易过敏食物：芒果、菠萝等，过敏体质妈妈更需注意。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 12, "category": "education",
        "title": "胎盘给予胎宝宝的", "subtitle": "孕12周·胎教建议",
        "content": "胎盘完全形成了！它是胎宝宝的生命线，负责输送营养和氧气、排出废物，还是一道保护屏障。借着胎盘这个\"桥梁\"，妈妈的情绪、心跳声、甚至荷尔蒙变化都能传递给胎宝宝。保持身心健康就是最好的胎教。",
        "tips": "可以开始有规律地做胎教了：每天固定时间听音乐、讲故事。",
        "is_essential": False, "sort_order": 4,
    },

    # ==================== 孕4月（13~16周） ====================
    # --- 第13周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 13, "category": "milestone",
        "title": "有桃子那么大了", "subtitle": "孕13周·胎儿发育",
        "content": "胎儿约7.5厘米，约23克重，如桃子大小。进入孕中期（\"蜜月期\"），早孕反应逐渐消失。胎儿五官更清晰，已有 fingerprint（指纹）。声带形成，能做吮吸和吞咽动作。皮肤薄如纸，血管清晰可见。",
        "tips": "孕中期是孕期最舒服的阶段，可以安排旅行、享受美食。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 13, "category": "exercise",
        "title": "散步是孕期最佳的运动方式", "subtitle": "孕13周·运动建议",
        "content": "孕中期身体逐渐稳定，散步是最安全有效的运动：每天30-60分钟，步伐不要太快。好处：促进血液循环、改善睡眠、控制体重、调节情绪。选择空气清新的公园或绿地，穿舒适的平底鞋。也可兼顾孕妇瑜伽。",
        "tips": "散步时带上水和小零食，避免低血糖。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 13, "category": "health",
        "title": "口腔问题和夫妻性生活节制", "subtitle": "孕13周·生活护理",
        "content": "孕期激素变化使牙龈易出血发炎，认真刷牙、用牙线。孕中期可适度恢复了性生活，每周1次为宜，选择不压迫腹部的姿势，动作轻柔。孕妈妈要暂别高跟鞋，换上防滑平底鞋。孕妇奶粉慎选，注意成分表。",
        "tips": "有先兆流产史或前置胎盘的孕妇，整个孕期禁止性生活。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 13, "category": "education",
        "title": "那些有关宝贝的趣事", "subtitle": "孕13周·胎教建议",
        "content": "和胎宝宝分享有趣的事：今天看到了什么、吃了什么、遇到了谁。这些日常对话是最自然的胎教。也可以开始给胎宝宝取个小名，每天和他/她打招呼。准爸爸也参与进来，胎儿对低频声音更敏感。",
        "tips": "每天固定时间（如睡前）和宝宝聊天，形成规律。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第14周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 14, "category": "milestone",
        "title": "开始皱眉做鬼脸了", "subtitle": "孕14周·胎儿发育",
        "content": "胎儿约8.7厘米，约43克重。面部肌肉发育，能皱眉、做鬼脸了！手臂比腿长，手指能抓握。肾脏开始产生尿液，排入羊水——这就是胎儿\"喝\"的羊水。肝脏开始分泌胆汁。",
        "tips": "可以通过B超看到胎儿吸吮拇指、打哈欠等可爱动作。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 14, "category": "food",
        "title": "增加五谷杂粮的摄入量", "subtitle": "孕14周·营养重点",
        "content": "孕中期食欲恢复，注意营养均衡。增加五谷杂粮：糙米、小米、燕麦、玉米、红薯，富含B族维生素和膳食纤维。铁质补充很重要：红肉、动物肝脏、菠菜、红枣。钙质继续补充：每天牛奶500ml。",
        "tips": "粗粮细粮搭配比例约1:3，过多粗粮影响矿物质吸收。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 14, "category": "health",
        "title": "孕期旅行和开车注意事项", "subtitle": "孕14周·生活护理",
        "content": "孕中期（14-28周）是适合旅行的窗口期。出行注意：避免长途颠簸，每2小时下车活动，系安全带（跨过臀部不压腹部）。孕期开车：调整座椅距方向盘远一些，不超过2小时。妊娠性瘙痒：保持皮肤滋润，避免热水烫洗。",
        "tips": "出行前咨询医生，带好产检资料和保险。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第15周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 15, "category": "milestone",
        "title": "唐氏综合筛查，甜蜜的恐慌", "subtitle": "孕15周·胎儿发育",
        "content": "胎儿约10厘米，约70克重。骨骼逐渐硬化，可在X光下看到骨骼（但孕期不做X光！）。胎毛覆盖全身，头发和眉毛开始生长。胎儿能听到妈妈的心跳和消化声，外界声音也可通过腹壁传到子宫内。",
        "tips": "胎儿的听觉开始发育，可以开始有意识地进行音乐胎教了。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 15, "category": "checkup",
        "title": "唐氏综合筛查相关事项", "subtitle": "孕15周·产检项目",
        "content": "唐氏筛查在孕15-20周抽血进行，检测HCG、AFP、uE3等指标，结合年龄、体重、孕周计算风险。检出率约65-80%。35岁以上或高危孕妇建议直接做无创DNA（NIPT），检出率>99%。唐筛高风险需羊水穿刺确诊。",
        "tips": "唐筛前一天清淡饮食，当天空腹抽血。准确率受孕周影响，日期要准。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 15, "category": "food",
        "title": "铁和钙：造血与骨骼的关键", "subtitle": "孕15周·营养重点",
        "content": "铁是造血材料：缺铁性贫血影响胎儿发育。多吃红肉、动物肝脏（每周1次）、菠菜、黑木耳。补铁同时吃维生素C丰富的水果促进吸收。钙坚固胎儿骨骼和牙齿：牛奶、豆腐、虾皮、芝麻酱。钙和铁分开服用，互相影响吸收。",
        "tips": "牛奶和补铁剂间隔2小时以上服用。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 15, "category": "education",
        "title": "儿歌《小毛驴》", "subtitle": "孕15周·胎教建议",
        "content": "胎宝宝听觉器官逐渐发育，可以正式开始音乐胎教了。选择轻柔、欢快的音乐，如《小毛驴》等经典儿歌，每天1-2次，每次15-20分钟。音量不宜过大，不要将耳机直接贴在腹部。也可给宝宝哼唱，妈妈的声音最温暖。",
        "tips": "固定时间播放音乐，形成规律，胎儿会产生记忆。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第16周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 16, "category": "milestone",
        "title": "用心体会胎动", "subtitle": "孕16周·胎儿发育",
        "content": "胎儿约11.6厘米，约100克重。胎儿活动能力增强，在羊水中翻滚、踢腿。经产妇可能首次感受到胎动了——像小鱼吐泡泡、蝴蝶扇翅膀。初产妇可能还分不清是胎动还是肠蠕动。胎儿面部已有表情，能眨眼。",
        "tips": "初次感觉胎动通常在16-20周，经产妇更早。安静躺下时更容易感受到。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 16, "category": "health",
        "title": "摆脱烦躁，孕妈一定要平静", "subtitle": "孕16周·心理情绪",
        "content": "孕中期激素趋于稳定，情绪波动减少。但仍可能出现莫名其妙的烦躁。应对方法：冥想呼吸、孕妇瑜伽、和朋友聚会。腹泻要重视治疗：多喝水防脱水，饮食清淡，持续2天以上或伴发烧需就医。",
        "tips": "每天记录胎动，是和宝宝建立连接的好方式。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 16, "category": "education",
        "title": "多抚摸胎宝宝", "subtitle": "孕16周·胎教建议",
        "content": "抚摸胎教：孕妈妈平躺放松，双手轻抚腹部，由上到下、从左到右缓慢抚摸。每天2-3次，每次5-10分钟。配合轻柔的对话：\"宝宝，妈妈在摸你呢\"。胎儿能感受到触碰和温度，促进触觉发育和亲子联结。",
        "tips": "抚摸时力度要轻柔，如有宫缩应立即停止。",
        "is_essential": False, "sort_order": 3,
    },

    # ==================== 孕5月（17~20周） ====================
    # --- 第17周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 17, "category": "milestone",
        "title": "胎宝宝开始快速长肉了", "subtitle": "孕17周·胎儿发育",
        "content": "胎儿约13厘米，约140克重。开始积聚棕色脂肪，体重将快速增长。听力进一步发育，能清晰听到外界声音。胎脂覆盖全身保护皮肤。骨骼更加硬化，关节活动灵活。循环系统完善，心跳有力。",
        "tips": "现在可以开始穿孕妇装了，舒适又好看。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 17, "category": "food",
        "title": "平衡饮食，预防过度肥胖", "subtitle": "孕17周·营养重点",
        "content": "孕中期食欲大增，注意控制体重增长（每周约0.5kg为宜）。平衡饮食：主食粗细搭配，蛋白质每天80-100g，蔬菜500g以上，水果200-300g。少吃高糖高油零食。体重增长过快增加妊娠糖尿病、巨大儿风险。",
        "tips": "每周称重同一时间（如早晨空腹），记录体重曲线。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 17, "category": "exercise",
        "title": "孕中期是游泳的好时期", "subtitle": "孕17周·运动建议",
        "content": "孕中期可以游泳！水中浮力减轻关节负担，水的压力促进血液循环。每周2-3次，每次30分钟，水温30℃左右。选择人少的时段，避免被踢到。不会游泳的可以水中行走。其他推荐：孕妇瑜伽、散步。",
        "tips": "游泳后注意补充水分，避免着凉。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 17, "category": "education",
        "title": "多和胎宝宝聊聊天吧", "subtitle": "孕17周·胎教建议",
        "content": "胎宝宝听力已较成熟，是语言胎教的好时机。每天和宝宝聊天：\"早上好，宝宝\" \"今天天气真好\" \"爸爸回来了\"。也可以读绘本、念儿歌。胎儿会记住妈妈的声音韵律，出生后对这种声音有安全感。",
        "tips": "准爸爸每天至少和宝宝说5分钟话，建立亲子联结。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第18周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 18, "category": "milestone",
        "title": "自我检测胎动", "subtitle": "孕18周·胎儿发育",
        "content": "胎儿约14.2厘米，约200克重。胎儿活动频繁：翻滚、踢腿、握拳。大多数孕妈妈此时能明确感受到胎动了。胎儿已能听到妈妈的心跳声、肠鸣音和外界较大声音。视网膜发育，对光有初步感知。",
        "tips": "胎动是胎儿健康的\"晴雨表\"，学会数胎动很重要。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 18, "category": "health",
        "title": "自我检测胎动的方法", "subtitle": "孕18周·生活护理",
        "content": "数胎动方法：每天早、中、晚各固定1小时，左侧卧安静计数。正常≥3-5次/小时。把3次总数×4=12小时胎动数，正常≥30次。胎动突然增多或减少都要警惕。饮食坚持\"四少\"：少盐、少糖、少油、少辛辣。",
        "tips": "胎儿有睡眠周期（约20-40分钟），安静时段不算异常。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 18, "category": "health",
        "title": "应对妊娠斑和腿部抽筋", "subtitle": "孕18周·疾病预警",
        "content": "妊娠斑：激素变化导致黑色素沉积，防晒是关键。腿部抽筋：多为缺钙或血液循环不畅。应对：补钙+维生素D，睡前泡脚按摩小腿，抽筋时伸直腿勾脚尖。挑食问题：少量多餐、变换烹调方式，保证营养摄入。",
        "tips": "妊娠斑产后大多会自行淡化，孕期不必过度焦虑。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 18, "category": "education",
        "title": "闪光卡片胎教", "subtitle": "孕18周·胎教建议",
        "content": "制作闪光卡片：彩色卡纸上画简单图案（圆、三角形、动物等），一边展示一边描述。视觉刺激促进胎儿视神经发育（通过妈妈的感受间接传递）。每天1次，每次3-5张卡片，配合温柔解说。也可以给宝宝看美丽图片。",
        "tips": "卡片颜色对比要鲜明，如黑底白图或红底黄图。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第19周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 19, "category": "milestone",
        "title": "\"孕味\"如此迷人", "subtitle": "孕19周·胎儿发育",
        "content": "胎儿约15厘米，约240克重。胎脂覆盖全身保护皮肤在羊水中浸泡。胎儿已能做出复杂的面部表情。消化系统开始运作，吞咽羊水并排出。神经系统发育迅速，能做出协调的肢体动作。生殖器已可通过B超辨认。",
        "tips": "本周可以通过B超确认宝宝性别了（如果有兴趣知道的话）。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 19, "category": "health",
        "title": "孕期好眠胜千金", "subtitle": "孕19周·生活护理",
        "content": "肚子渐大可能影响睡眠。改善方法：左侧卧+孕妇枕支撑腹部和腿部；睡前泡脚、听轻音乐放松；卧室温度适宜、遮光好。不宜使用安眠药。会休息的孕妈更轻松：午休30分钟，工作时每1小时起身走动。不宜去拥挤场所。",
        "tips": "左侧卧位有利于子宫血液供应，但不必强求，舒服最重要。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 19, "category": "food",
        "title": "远离加工食品，食用完整食品", "subtitle": "孕19周·营养重点",
        "content": "\"完整食品\"指未经精细加工的食物：糙米>白米、全麦>精面、完整水果>果汁。加工食品含添加剂、反式脂肪、过量盐糖，孕期尽量少吃。别补过头导致营养过剩：维生素不是越多越好，均衡饮食即可满足需要。",
        "tips": "食品配料表越长，加工程度越高，孕期越要少吃。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第20周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 20, "category": "milestone",
        "title": "孕程过半，去做大排畸B超", "subtitle": "孕20周·胎儿发育",
        "content": "胎儿约16.5厘米，约300克重。头顶到臀长约25cm。胎儿已有了睡眠和觉醒周期。胎动有力，妈妈能清楚感知。胎儿皮肤分为两层，汗腺开始形成。眉毛和头发明显生长。牙齿在牙龈下开始形成。",
        "tips": "孕20周是孕期中点，大排畸检查的最佳时机之一。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 20, "category": "checkup",
        "title": "大排畸B超（系统超声）", "subtitle": "孕20周·产检项目",
        "content": "大排畸在孕20-24周进行，是孕期最重要的B超之一。系统性检查胎儿头颅、面部、心脏、脊柱、四肢、内脏等结构，发现大部分先天性畸形。检查时长约30-60分钟。如果宝宝不配合（体位不好），可能需要多次才能完成。",
        "tips": "检查前可吃点甜食让宝宝活跃，穿分体衣服方便检查。提前预约！",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 20, "category": "food",
        "title": "补充维生素C，提高免疫力", "subtitle": "孕20周·营养重点",
        "content": "维生素C促进铁吸收、增强免疫力、有利胶原蛋白合成。每天需要100mg。富含维C：猕猴桃、橙子、草莓、彩椒、西兰花、西红柿。注意：维C不耐高温，蔬菜不宜过度烹调。不宜过多日光浴，紫外线加重妊娠斑。",
        "tips": "补铁食物和维C食物搭配吃，吸收率翻倍。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 20, "category": "education",
        "title": "故事《小蝌蚪找妈妈》", "subtitle": "孕20周·胎教建议",
        "content": "给胎宝宝讲经典故事《小蝌蚪找妈妈》，富有童趣又蕴含知识。讲故事时声音温柔、节奏缓慢，模拟不同角色的语调。胎儿虽听不懂内容，但能感受语言的韵律和妈妈的声音频率。每天15分钟，坚持是关键。",
        "tips": "同个故事可以反复讲，胎儿会对熟悉的韵律产生安全感。",
        "is_essential": False, "sort_order": 4,
    },

    # ==================== 孕6月（21~24周） ====================
    # --- 第21周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 21, "category": "milestone",
        "title": "胎宝宝有300克重了", "subtitle": "孕21周·胎儿发育",
        "content": "胎儿约26.7厘米（顶臀长），约300-360克重。胎儿活动量增大，能做翻滚、踢腿、打嗝等动作。眉毛和眼睑清晰可见。胎儿已能吞咽羊水，消化系统开始练习工作。骨髓开始制造白细胞，为出生后免疫做准备。",
        "tips": "可以学会测量宫底高了，了解子宫增长是否正常。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 21, "category": "health",
        "title": "学会测量宫底高", "subtitle": "孕21周·生活护理",
        "content": "宫底高反映胎儿生长情况。测量方法：排尿后平躺，用皮尺从耻骨联合上缘到宫底最高点。孕21周约21cm，宫底约在肚脐上方1cm。保养有方防妊娠纹：涂抹妊娠油/霜按摩腹部，控制体重增长速度。",
        "tips": "宫底高因人而异，只要持续增长就不必担心。具体以医生测量为准。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 21, "category": "food",
        "title": "热量摄取因人而异", "subtitle": "孕21周·营养重点",
        "content": "孕中期每日增加300-500大卡即可（不是\"一个人吃两个人的份\"）。体力劳动者多补充碳水，脑力劳动者多补充蛋白。孕期胀气：少食产气食物（豆类、洋葱、红薯），细嚼慢咽，饭后散步。适当嗑瓜子可帮助消化。",
        "tips": "瓜子选择原味，避免盐焗和糖炒，控制钠摄入。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第22周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 22, "category": "milestone",
        "title": "胎宝宝的动作更多了", "subtitle": "孕22周·胎儿发育",
        "content": "胎儿约27.8厘米，约430克重。胎儿已能紧紧握拳。听觉更加敏锐，能分辨不同声音。开始有抓握反射。皮肤还是皱巴巴的，因为还没有足够脂肪。嘴唇更加明显，舌头上有味蕾。",
        "tips": "可以给宝宝取个亲切的乳名了，每天用这个名字和宝宝说话。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 22, "category": "food",
        "title": "细嚼慢咽+减少吃盐+补充维D", "subtitle": "孕22周·营养重点",
        "content": "细嚼慢咽帮助消化、减轻胀气。减少盐摄入：每天不超过6g，预防水肿和妊娠高血压。补充维生素D促进钙吸收：每天晒太阳15-20分钟，吃蛋黄、深海鱼。避免高糖饮食：过多糖分导致肥胖和妊娠糖尿病。",
        "tips": "加工食品、酱油、味精中含大量隐形盐，烹饪时注意减少。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 22, "category": "education",
        "title": "给宝宝取个亲切的乳名", "subtitle": "孕22周·胎教建议",
        "content": "给宝宝取个小名，从今天起用这个名字和宝宝说话。乳名简单亲切即可，如\"小豆豆\"\"小星星\"。胎教训练听力：播放不同节奏的音乐，观察宝宝的反应。用正确方式音乐胎教——音箱放1米外，音量适中，每次不超30分钟。",
        "tips": "不要将耳机直接贴在腹部，音量过大可能损伤胎儿听力。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第23周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 23, "category": "milestone",
        "title": "皱巴巴的微型老头", "subtitle": "孕23周·胎儿发育",
        "content": "胎儿约28.9厘米，约500克重。皮肤因缺脂肪而皱巴巴的，呈微红色，像\"小老头\"。但骨骼和肌肉继续强壮。胎儿能听到妈妈的声音和心跳，对外界声音有反应。肺部血管开始发育，为呼吸做准备。",
        "tips": "此时如果早产，胎儿有微弱存活可能，但需极力避免。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 23, "category": "health",
        "title": "运动要格外小心", "subtitle": "孕23周·生活护理",
        "content": "孕中晚期重心变化大，运动要格外注意安全。避免：跳跃、骑马、滑雪等高风险运动。推荐：散步、孕妇瑜伽、游泳、简单的伸展。上下班注意安全：避开高峰、穿防滑鞋、乘坐有座位的交通工具。适当增加奶制品摄入。",
        "tips": "运动时如出现宫缩、出血、头晕立即停止并就医。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 23, "category": "education",
        "title": "准爸爸也要参与进来", "subtitle": "孕23周·胎教建议",
        "content": "准爸爸胎教时间：每天固定时段给宝宝讲故事、聊天、唱歌。爸爸低沉的声音更容易穿透腹壁被胎儿听到。准爸爸可以轻轻贴着妈妈腹部和宝宝说话，宝宝会用胎动\"回应\"。爸爸的参与让妈妈幸福感倍增，也有利于家庭和谐。",
        "tips": "准爸爸可以每天晚上睡前花5分钟和宝宝说\"晚安\"。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第24周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 24, "category": "milestone",
        "title": "不做\"糖\"妈妈", "subtitle": "孕24周·胎儿发育",
        "content": "胎儿约30厘米，约600克重。胎儿体重加速增长。大脑发育迅速，神经细胞数量已达数十亿。内耳发育完全，听力接近成人水平。肺部开始产生表面活性物质，为出生后呼吸做准备。",
        "tips": "本周是做糖耐量检查（OGTT）的时间窗口（24-28周）。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 24, "category": "checkup",
        "title": "糖耐量检查（OGTT）", "subtitle": "孕24周·产检项目",
        "content": "OGTT在孕24-28周进行。检查方法：空腹抽血→口服75g葡萄糖→1小时抽血→2小时抽血。正常范围：空腹<5.1、1h<10.0、2h<8.5 mmol/L。任何一项超标即诊断妊娠糖尿病。检查前3天正常饮食，前夜10点后禁食禁水。",
        "tips": "糖水很甜可能引起恶心，慢慢喝完5分钟内即可。检查当天带零食，结束后补充能量。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 24, "category": "food",
        "title": "多吃核桃，预防妊娠糖尿病", "subtitle": "孕24周·营养重点",
        "content": "核桃富含α-亚麻酸和DHA，促进胎儿大脑发育，每天3-5个。预防和应对妊娠糖尿病：控制精制糖摄入（蛋糕、奶茶、含糖饮料），主食粗细搭配，多吃蔬菜，适量蛋白质。血糖偏高需在营养师指导下控制饮食。",
        "tips": "妊娠糖尿病大多产后恢复，但孕期需认真控制，否则影响母婴健康。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 24, "category": "education",
        "title": "故事《萝卜回来了》", "subtitle": "孕24周·胎教建议",
        "content": "讲《萝卜回来了》：小兔找到萝卜分享给朋友，最后萝卜又回到小兔家。温暖的故事传递分享和友爱。讲故事时用不同声调模仿不同动物。配合轻拍腹部和宝宝互动，胎儿会用胎动回应。每天坚持15-20分钟。",
        "tips": "选择有重复结构的童话，胎宝宝会对重复的韵律产生记忆。",
        "is_essential": False, "sort_order": 4,
    },

    # ==================== 孕7月（25~28周） ====================
    # --- 第25周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 25, "category": "milestone",
        "title": "胎宝宝大脑发育又一个高峰", "subtitle": "孕25周·胎儿发育",
        "content": "胎儿约34.6厘米，约660克重。大脑皮层出现沟回，大脑发育进入又一个高峰。胎儿能感知光线变化，用手电筒照腹部会感觉到胎动增加。皮肤开始变得光滑，逐渐长肉。嗅觉开始发育。",
        "tips": "大脑发育高峰期，多补充DHA和胆碱。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 25, "category": "food",
        "title": "补充DHA + 胆碱，促进大脑发育", "subtitle": "孕25周·营养重点",
        "content": "DHA是大脑和视网膜的主要成分：每周吃2-3次深海鱼（三文鱼、鳕鱼），或补充藻油DHA。胆碱促进记忆功能：蛋黄是最佳来源，每天1-2个。食用油精选：橄榄油、亚麻籽油、核桃油轮换使用。饮食粗细搭配。",
        "tips": "深海鱼选择低汞品种，避免剑鱼、鲨鱼等大型掠食鱼类。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 25, "category": "health",
        "title": "孕晚期活动与做家务安全细则", "subtitle": "孕25周·生活护理",
        "content": "活动安全：走路放慢、上下楼梯扶扶手、避免弯腰捡东西（应蹲下）。家务安全：不搬重物、不踮脚够高物、不接触化学清洁剂。应对胎位异常：孕28周前不必紧张，多数会自行转正。常玩踢肚子游戏：轻拍腹部，宝宝会踢回。",
        "tips": '"踢肚子游戏"每天可以做，是很好的亲子互动，也帮助监测胎动。',
        "is_essential": False, "sort_order": 3,
    },
    # --- 第26周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 26, "category": "milestone",
        "title": "胎宝宝的眼睛睁开了", "subtitle": "孕26周·胎儿发育",
        "content": "胎儿约35.6厘米，约760克重。胎儿眼睛能睁开了！视网膜发育完善，能对光线做出反应。胎儿会吸吮拇指，能做出抓握动作。大脑活动更加复杂，已建立睡眠-觉醒周期。睾丸（男）开始下降。",
        "tips": "用手电筒照腹部，宝宝可能会朝光源方向转动——有趣的光照胎教。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 26, "category": "checkup",
        "title": "孕晚期检查 + 监测体重", "subtitle": "孕26周·产检项目",
        "content": "孕晚期产检频率增加（每2周一次）。检查项目：血压、体重、宫高、腹围、胎心、水肿、血常规。警惕妊娠高血压：血压≥140/90mmHg需高度重视。每周监测体重增长：正常每周约0.5kg，过快需调整饮食。拍摄大肚婆纪念照。",
        "tips": "如有头痛、视物模糊、上腹痛，立即就医——可能是子痫前期征兆。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 26, "category": "emotion",
        "title": "预防孕期抑郁症", "subtitle": "孕26周·心理情绪",
        "content": "孕晚期身体负担重，可能出现焦虑、失眠、情绪低落。及时调节：倾诉、运动、冥想。与伴侣多沟通未来的育儿分工。解读妊娠期怪梦：激素和焦虑导致的梦境不必担心。通过情感调节促进宝宝记忆发育。",
        "tips": "如情绪低落持续两周以上、影响日常生活，寻求心理咨询。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第27周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 27, "category": "milestone",
        "title": "胎宝宝长出了柔软细密的头发", "subtitle": "孕27周·胎儿发育",
        "content": "胎儿约36.6厘米，约875克重。头上长出柔软细密的头发。大脑皮层迅速发育，已能记忆。胎儿能区分妈妈和别人声音。肺部发育但还不足以独立呼吸。胎儿在子宫中位置可能开始调整（头位/臀位）。",
        "tips": "此时胎儿体重将进入快速增长期，每周增约200g。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 27, "category": "food",
        "title": "不宜空腹/饭后吃水果 + 忌过量温补", "subtitle": "孕27周·营养重点",
        "content": "水果不宜空腹吃（刺激胃黏膜），不宜饭后立即吃（胀气），最佳时间是两餐之间。不宜过量食用温热补品（人参、桂圆、阿胶），可能导致上火甚至出血。均衡饮食仍是核心：蛋白质、碳水、蔬果、奶制品合理搭配。",
        "tips": "每天水果200-350g即可，糖分高的水果（葡萄、荔枝）要限量。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 27, "category": "health",
        "title": "开始规划你的产假", "subtitle": "孕27周·生活护理",
        "content": "了解公司产假政策：国家规定98天+各地奖励假。与直属领导沟通交接计划。提前考虑：谁来照顾月子（月嫂/家人/月子中心）。保存好所有产检资料。不宜空腹、饭后立刻吃水果。不宜过量温补品。",
        "tips": "产前假部分地区有规定，提前了解当地政策和公司制度。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第28周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 28, "category": "milestone",
        "title": "胎动像波浪一样", "subtitle": "孕28周·胎儿发育",
        "content": "胎儿约37.6厘米，约1000克重。胎动有力而有规律，能从腹部表面看到\"鼓包\"。胎儿已能眨眼、咳嗽。大脑沟回进一步增多。如果此时早产，存活率约80-90%，但需在NICU intensive护理。进入孕晚期！",
        "tips": "从28周开始每天规律数胎动，是自我监测的重要手段。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 28, "category": "health",
        "title": "预防巨大儿和孕期痔疮", "subtitle": "孕28周·疾病预警",
        "content": "预防巨大儿（>4000g）：控制饮食、适度运动、监测血糖。巨大儿增加难产和产伤风险。孕期痔疮：子宫压迫+激素导致静脉扩张。应对：多喝水、多纤维饮食、温水坐浴、避免久坐久站。严重时就医。",
        "tips": "孕28周后产检改为每2周一次，密切关注胎儿发育。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 28, "category": "education",
        "title": "神奇的乳汁：了解母乳喂养", "subtitle": "孕28周·胎教建议",
        "content": "开始了解母乳喂养知识：初乳是\"液体黄金\"富含抗体，产后尽早开奶。阅读母乳喂养书籍、参加医院课程。可以开始轻柔按摩乳房为哺乳做准备（不要剧烈揉搓）。给宝宝讲关于\"乳汁的神奇\"故事，传递母爱的温暖。",
        "tips": "如有乳头内陷，现在可以开始做乳头牵拉练习（轻柔）。",
        "is_essential": False, "sort_order": 3,
    },

    # ==================== 孕8月（29~32周） ====================
    # --- 第29周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 29, "category": "milestone",
        "title": "妈妈要开始记录胎动了", "subtitle": "孕29周·胎儿发育",
        "content": "胎儿约38.6厘米，约1150克重。肌肉和肺部持续发育。大脑能控制呼吸和体温。胎儿能分辨光和暗、甜和苦。头朝下（头位）的概率增大。胎动规律：每天早中晚各有活跃期。骨骼已完全形成但还柔软。",
        "tips": "从本周起每天认真记录胎动，发现异常及时就医。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 29, "category": "health",
        "title": "开始记录胎动 + 预防早产", "subtitle": "孕29周·生活护理",
        "content": "记录胎动方法：每天固定3个时段各1小时，左侧卧安静数。早中晚胎动数之和×4≥30为正常。<10次或比平时减少50%需就医。预防早产：避免劳累、避免性生活、注意宫缩。饮食结合孕晚期特点：少盐少油、高蛋白、补铁补钙。",
        "tips": "规律宫缩（5-6分钟一次伴疼痛）是早产信号，立即去医院。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 29, "category": "food",
        "title": "孕晚期饮食特点 + 适当嗑瓜子", "subtitle": "孕29周·营养重点",
        "content": "孕晚期饮食原则：少食多餐（每天5-6顿），减少单次进食量（胃受压迫）。饭后可适当嗑瓜子助消化。有饮茶习惯可喝淡绿茶（少喝浓茶咖啡因影响铁吸收）。补充镁元素帮助缓解抽筋：坚果、全谷物、深绿蔬菜。",
        "tips": "晚上不要吃太饱，睡前2小时不进食，减少胃食管反流。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 29, "category": "education",
        "title": "光照胎教", "subtitle": "孕29周·胎教建议",
        "content": "光照胎教：每天定时用手电筒（弱光）贴在腹部照射，每次5分钟，观察宝宝的胎动反应。可以移动光源，引导宝宝追光。光照胎教促进胎儿视觉发育和睡眠-觉醒规律。注意：不要用强光、时间不宜过长。",
        "tips": "选择晚上固定时间进行，帮助建立昼夜节律。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第30周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 30, "category": "milestone",
        "title": "胎宝宝约1500克了", "subtitle": "孕30周·胎儿发育",
        "content": "胎儿约39.9厘米，约1500克重。胎儿体重快速增长，约每天增30g。大脑和神经系统发育接近成熟。胎儿已能调节体温。眼睛能自由开合，有睡眠-觉醒周期。胎位大多已固定为头位，如臀位可尝试纠正。",
        "tips": "本周进行骨盆测量，评估分娩方式。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 30, "category": "checkup",
        "title": "骨盆测量 + 胎心监测", "subtitle": "孕30周·产检项目",
        "content": "骨盆测量评估是否能顺产：测量骨盆入口、中骨盆、出口各径线。结合胎儿大小和胎位综合判断。同时常规检查：血压、体重、宫高、水肿。应对心悸呼吸困难：左侧卧、少食多餐、避免平躺。胃灼感：少食多餐避免反流。",
        "tips": "骨盆测量可能有轻微不适，放松配合即可。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 30, "category": "food",
        "title": "进补要适度，别贪食某些食物", "subtitle": "孕30周·营养重点",
        "content": "孕晚期进补要适度，过犹不及。千万别贪食荔枝（上火、可能引起阴道出血）和马齿苋（可能促进宫缩）。适当吃坚果。继续补铁补钙。每天牛奶500ml，鸡蛋1-2个，优质蛋白100g。少盐少糖少油，预防水肿和妊娠高血压。",
        "tips": "红枣枸杞可以泡水喝，但不建议大量进补中药。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第31周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 31, "category": "milestone",
        "title": "胎宝宝的房子变小了", "subtitle": "孕31周·胎儿发育",
        "content": "胎儿约41.1厘米，约1500-1600克重。子宫空间变小，胎动幅度减小但力量增大。胎儿能做复杂的吸吮、吞咽动作。肺部发育接近成熟，但还需进一步完善。五个感官全部开始工作。胎儿的免疫系统正在发育。",
        "tips": "胎动从大幅度变为局部顶踹是正常的，但要保持每天数胎动。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 31, "category": "food",
        "title": "补充α-亚麻酸促大脑发育", "subtitle": "孕31周·营养重点",
        "content": "α-亚麻酸是DHA的前体，促进胎儿大脑和视网膜发育：亚麻籽油、核桃、深海鱼。孕晚期胎儿大脑发育最后冲刺期，营养要跟上。同时注意：上班族妈妈适时停止工作。性生活频率要注意减少或停止。",
        "tips": "亚麻籽油不宜高温烹饪，凉拌或直接食用最佳。",
        "is_essential": False, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 31, "category": "health",
        "title": "腰背疼痛怎么缓解", "subtitle": "孕31周·生活护理",
        "content": "腰背疼痛是孕晚期常见困扰：重心前移+激素松弛韧带所致。缓解方法：使用托腹带、坐时腰后垫靠枕、避免久站久坐、热敷按摩。睡觉用孕妇枕支撑。避免弯腰捡物，应蹲下。严重疼痛伴下肢麻木需就医排查腰椎问题。",
        "tips": "站姿：收腹挺背，不挺肚子；坐姿：双脚平放不翘二郎腿。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第32周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 32, "category": "milestone",
        "title": "胎宝宝约1600克重了", "subtitle": "孕32周·胎儿发育",
        "content": "胎儿约42.4厘米，约1700克重。皮下脂肪开始积累，皮肤变得光滑。趾甲已长出。消化系统基本发育完成。神经系统可控制呼吸和体温。胎位基本固定。B超可评估胎儿大小、羊水量、胎盘成熟度。",
        "tips": "B超提示脐带绕颈别着急：大多数不影响分娩，听取医生评估。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 32, "category": "health",
        "title": "准备好母婴用品 + 科学控体重", "subtitle": "孕32周·生活护理",
        "content": "开始准备待产包和母婴用品：产褥垫、一次性内裤、哺乳衣、NB纸尿裤、包被、奶瓶等。根据体重科学控制食量：体重增长过快减少碳水，过慢增加蛋白质。脐带绕颈别着急——大多数是松弛的U型绕颈，不影响供血。决定产假时间。",
        "tips": "待产包分两个包：一个入院急需的（证件+产褥垫），一个住院期间用的。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 32, "category": "education",
        "title": "尊重胎宝宝的作息时间", "subtitle": "孕32周·胎教建议",
        "content": "胎宝宝已建立睡眠-觉醒周期，胎教要尊重其作息。活跃时进行音乐、语言、抚摸胎教；安静时（睡眠中）不打扰。可以通过观察胎动规律了解宝宝的作息。晚上10点后不做胎教，让胎宝宝休息。规律胎教有助于宝宝出生后的作息规律。",
        "tips": "如果夜间胎动频繁影响睡眠，白天减少刺激，帮助宝宝调整作息。",
        "is_essential": False, "sort_order": 3,
    },

    # ==================== 孕9月（33~36周） ====================
    # --- 第33周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 33, "category": "milestone",
        "title": "圆润可爱的小宝贝", "subtitle": "孕33周·胎儿发育",
        "content": "胎儿约43.7厘米，约2000克重。皮下脂肪增多，身体变得圆润可爱。皮肤从暗红变为粉红。骨骼硬化，但头骨仍有缝隙（便于通过产道）。免疫系统继续发育。胎位基本确定，如臀位可能需评估剖宫产。",
        "tips": "提前预订月嫂或月子中心，好的月嫂需要提前预约。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 33, "category": "health",
        "title": "慎重选择剖宫产", "subtitle": "孕33周·生活护理",
        "content": "剖宫产是手术，有出血、感染、恢复慢等风险，仅在医学指征下选择。自然分娩好处多：恢复快、利于新生儿免疫力建立、产后出血少。如无医学指征，建议尝试顺产。提前了解分娩方式，与医生充分沟通。提前预订月嫂。",
        "tips": "有前次剖宫产史、胎位不正、前置胎盘等情况需与医生讨论分娩方案。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 33, "category": "education",
        "title": "通过看、听、体会进行美育胎教", "subtitle": "孕33周·胎教建议",
        "content": "美育胎教：看美丽的图片/画作/自然风景，听优美的音乐，体会美好的感受。孕妈妈的审美体验通过神经-内分泌系统传递给胎宝宝，促进其感知发育。可以参观美术馆、看美丽的画册、在大自然中散步。保持心情愉悦。",
        "tips": "避免看恐怖、暴力等负面内容的影视作品。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第34周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 34, "category": "milestone",
        "title": "不用担心早产了", "subtitle": "孕34周·胎儿发育",
        "content": "胎儿约45厘米，约2300克重。中枢神经系统基本成熟，肺部发育接近完成。如果此时出生，绝大多数能健康存活。胎儿已将大部分胎毛蜕去。胎儿的免疫系统在持续发育。胎位完全固定。",
        "tips": "从34周开始，即使早产也不用太担心存活问题，但当然足月更好。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 34, "category": "checkup",
        "title": "胎心监测 + 脐带血科普", "subtitle": "孕34周·产检项目",
        "content": "从34周开始每次产检加做胎心监护（NST），记录胎儿心率变化和胎动。正常NST：胎心基线110-160bpm，有加速反应。警惕危险信号：胎心过快/过慢、减速。脐带血知识：可储存用于未来造血干细胞移植，费用约2万/20年，自愿选择。",
        "tips": "做胎心监护前吃点东西，宝宝活跃时数据更准确。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 34, "category": "food",
        "title": "适当吃坚果 + 尽量不吃夜宵", "subtitle": "孕34周·营养重点",
        "content": "适当吃坚果：核桃、杏仁、花生，补充不饱和脂肪酸和矿物质。尽量不要吃夜宵：增加肠胃负担、影响睡眠、导致体重过快增长。吃一些清火食物：绿豆汤、梨、苦瓜，预防孕晚期上火。饮食以清淡易消化为主。",
        "tips": "如晚上饿，可喝一小杯温牛奶代替正餐。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第35周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 35, "category": "milestone",
        "title": "已经发育成一个新生儿了", "subtitle": "孕35周·胎儿发育",
        "content": "胎儿约46.2厘米，约2500克重。胎儿已基本发育成熟，各器官功能完善。肾脏发育完成，肝脏能处理废物。肺部产生足够的表面活性物质。胎儿的头部可能开始入盆（下沉到骨盆），为出生做准备。",
        "tips": "入盆后尿频会加重、呼吸更轻松、食欲可能改善。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 35, "category": "health",
        "title": "应对妊娠水肿 + 警惕胎膜早破", "subtitle": "孕35周·疾病预警",
        "content": "妊娠水肿：多休息、左侧卧、抬腿、少盐。如水肿伴高血压和蛋白尿需警惕子痫前期。补充维生素K：预防产后大出血，多吃绿叶蔬菜、西兰花。警惕胎膜早破：突然大量流水（不像尿液）需立即就医，垫高臀部平躺去医院。",
        "tips": "区分羊水和尿液：羊水清亮无味、不受控制流出；尿液有氨味、可控制。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 35, "category": "education",
        "title": "晒太阳有益胎宝宝脑健康", "subtitle": "孕35周·胎教建议",
        "content": "孕妈妈晒太阳（每日15-20分钟）不仅补充维生素D促进钙吸收，阳光还有助于调节情绪、促进胎儿脑健康。选择早晨或傍晚阳光柔和时。同时进行情感胎教：和宝宝说\"快出来了，我们都很期待你\"，传递安全感和爱意。",
        "tips": "晒太阳时不要隔着玻璃，玻璃会阻挡UVB影响维D合成。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第36周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 36, "category": "milestone",
        "title": "宝宝离你越来越近了", "subtitle": "孕36周·胎儿发育",
        "content": "胎儿约47.4厘米，约2700克重。胎儿体重继续增长，每周约增200-250g。大多数胎儿已入盆。胎脂和胎毛开始脱落。肠道内聚集胎粪（出生后排出）。B超评估胎盘功能、羊水量、胎儿大小，为分娩做准备。",
        "tips": "从36周开始产检改为每周一次，密切监测。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 36, "category": "checkup",
        "title": "查胎盘功能 + 为自然分娩加分", "subtitle": "孕36周·产检项目",
        "content": "B超评估胎盘功能（分级0-III级）、羊水量（AFI正常8-25cm）、胎儿预估体重。GBS筛查（B族链球菌）：阳性者在分娩时需用抗生素预防新生儿感染。为自然分娩加分的6种方法：适度运动、控制体重、学习呼吸法、保持信心、产前按摩、分娩球练习。",
        "tips": "了解分娩征兆：见红、破水、规律宫缩。准备好入院路线和紧急联系人。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 36, "category": "emotion",
        "title": "克服临产期焦虑综合征", "subtitle": "孕36周·心理情绪",
        "content": "临近分娩的焦虑很普遍：害怕疼痛、担心宝宝健康、紧张未知。克服方法：参加分娩预演课程、学习拉玛泽呼吸法、与已生产妈妈交流。家人多关怀和爱护孕妈妈：陪伴产检、做家务、倾听。保证充足休息，为分娩积蓄体力。",
        "tips": "写一封给宝宝的信，把期待和情感写下来，有助于缓解焦虑。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 36, "category": "education",
        "title": "孕期音乐：为分娩做心理准备", "subtitle": "孕36周·胎教建议",
        "content": "选择舒缓的音乐（如古典乐、自然音效）帮助放松。为分娩准备一个\"音乐清单\"——在宫缩时听帮助放松和转移注意力。继续和宝宝说话：\"准备好了吗？爸爸妈妈在等你\"。通过冥想和音乐想象顺利分娩的过程。",
        "tips": "把音乐清单下载到手机，入院时带上耳机或蓝牙音箱。",
        "is_essential": False, "sort_order": 4,
    },

    # ==================== 孕10月（37~40周） ====================
    # --- 第37周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 37, "category": "milestone",
        "title": "随时可能和宝宝相见", "subtitle": "孕37周·胎儿发育",
        "content": "胎儿约48.6厘米，约3000克重。胎儿已足月（37周后即为足月），各器官发育成熟。胎儿继续长肉，每天约增14g。胎头入盆更深。免疫球蛋白通过胎盘传递给宝宝。胎儿在练习呼吸和吸吮，为出生做准备。",
        "tips": "随时可能发动！确认待产包已就绪，入院资料齐全。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 37, "category": "health",
        "title": "了解临产征兆 + 准备入院物品", "subtitle": "孕37周·生活护理",
        "content": "三大临产征兆：①见红——粉红色或褐色分泌物，通常24-48小时内临产；②破水——羊水流出，立即平卧就医；③规律宫缩——5-6分钟一次、持续30秒以上、越来越强。入院物品：身份证、医保卡、产检本、待产包、手机充电器。",
        "tips": "破水后禁止洗澡（防感染），立即垫高臀部平躺去医院。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 37, "category": "food",
        "title": "为临产做准备：补充镁和锌", "subtitle": "孕37周·营养重点",
        "content": "临产前饮食以高能量、易消化为主：鸡蛋羹、面条、粥。补充镁元素帮助放松肌肉（坚果、全谷物）。适当多吃鲤鱼和鲫鱼，补充优质蛋白。锌元素帮助顺利分娩：牡蛎、瘦肉、坚果。分娩当天可吃巧克力补充能量。",
        "tips": "临产前不要吃太多油腻食物，以免宫缩时呕吐。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 37, "category": "education",
        "title": "剪纸、绘画或手工编织", "subtitle": "孕37周·胎教建议",
        "content": "做手工是很好的胎教：剪纸、绘画、编织小袜子等。手工活动需要专注和耐心，有助于稳定情绪。妈妈的手工成品也是送给宝宝的出生礼物。边做手工边和宝宝说话：\"妈妈在给你织小袜子呢\"。保持愉悦、平静的状态迎接分娩。",
        "tips": "做手工时注意坐姿，不要久坐引起腰痛。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第38周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 38, "category": "milestone",
        "title": "已经是足月儿了", "subtitle": "孕38周·胎儿发育",
        "content": "胎儿约49.8厘米，约3200克重。胎儿完全成熟，已具备独立生活能力。胎毛几乎完全消失，皮肤光滑粉嫩。胎儿的肠道内充满胎粪。头部已深深入盆。本周可能随时开始分娩。",
        "tips": "保持手机畅通，和家人保持联系，随时准备出发去医院。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 38, "category": "emotion",
        "title": "帮助孕妈妈克服临产恐惧", "subtitle": "孕38周·心理情绪",
        "content": "临产恐惧很常见：怕疼、怕出意外、怕自己\"不行\"。克服方法：了解分娩过程（三个产程）减少未知恐惧、学习拉玛泽呼吸法、信赖医生和助产士、信任身体的力量。准爸爸给予鼓励和陪伴：一起练习呼吸、按摩腰背、准备好生产时的加油话。",
        "tips": '"我能做到\"——每天对自己说三遍，积极暗示很有力量。',
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 38, "category": "education",
        "title": "温暖的胎教故事", "subtitle": "孕38周·胎教建议",
        "content": "给宝宝讲最后一个\"子宫里的故事\"：\"亲爱的宝宝，你已经长大了，妈妈准备好迎接你了。妈妈很勇敢，你也要勇敢。我们马上就能见面了。\"用温柔有力的声音传递信心和爱。这是孕期最后的宁静时光，好好享受和宝宝一体的日子。",
        "tips": "准爸爸也可以贴着肚子说几句鼓励的话，给妈妈和宝宝力量。",
        "is_essential": False, "sort_order": 3,
    },
    # --- 第39周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 39, "category": "milestone",
        "title": "最后的冲刺", "subtitle": "孕39周·胎儿发育",
        "content": "胎儿约50.7厘米，约3400克重。胎儿继续积聚脂肪，免疫系统进一步完善。外生殖器发育完成。胎儿已准备好来到这个世界。大多数胎儿在37-40周间出生，只有约5%在预产期当天出生。",
        "tips": "耐心等待，保持好心情，宝宝会选好时辰来的！",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 39, "category": "health",
        "title": "了解顺利分娩因素和分娩方式", "subtitle": "孕39周·生活护理",
        "content": "顺利分娩的四大因素：产力（宫缩力）、产道（骨盆和软产道）、胎儿（大小和胎位）、心理（信心和配合）。分娩方式：自然分娩（首选）、无痛分娩（硬膜外麻醉减轻疼痛）、剖宫产（医学指征）、辅助分娩（产钳/胎吸）。三个产程：宫口扩张→胎儿娩出→胎盘娩出。",
        "tips": "勇敢面对分娩疼痛——它是阵发性的，每次宫缩间都有休息。树立信心！",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 39, "category": "exercise",
        "title": "适度运动助分娩", "subtitle": "孕39周·运动建议",
        "content": "最后阶段温和运动帮助分娩：散步（促进胎头下降）、分娩球练习（坐在球上画圈、前后摆动）、深蹲（扶着椅子浅蹲，打开骨盆）、爬楼梯（适度，不勉强）。做拉玛泽呼吸法练习：浅呼吸→喘息呼吸→用力推。不要做剧烈运动。",
        "tips": "运动时有人陪伴，如出现规律宫缩立即停止。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 39, "category": "emotion",
        "title": "树立分娩的自信", "subtitle": "孕39周·心理情绪",
        "content": "分娩是自然的生理过程，女性身体天生具备这个能力。树立信心：\"我的身体知道该怎么做\"\"每一次宫缩都让我离宝宝更近一步\"。与已顺产的妈妈交流经验。写一封\"给自己的鼓励信\"。准爸爸是最大的支持者——陪伴、鼓励、按摩。",
        "tips": "相信医生和助产士，他们会全程守护你和宝宝的安全。",
        "is_essential": False, "sort_order": 4,
    },
    # --- 第40周 ---
    {
        "stage_type": "pregnancy_week", "stage_value": 40, "category": "milestone",
        "title": "喜极而泣，迎接宝宝的到来", "subtitle": "孕40周·胎儿发育",
        "content": "胎儿约51.2厘米，约3500克重。胎儿已完全发育成熟，随时可以出生。指甲已超过指尖。胸部隆起表示呼吸准备好。胎儿在子宫中的使命已经完成——是时候来到这个世界了！预产期只是估计，前后两周内出生都正常。",
        "tips": "超过41周未发动需就医，医生会评估是否需要催产。",
        "is_essential": True, "sort_order": 1,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 40, "category": "health",
        "title": "坐月子早叮咛 + 产后检查", "subtitle": "孕40周·生活护理",
        "content": "产后注意事项：①月子期注意休息但不要一直躺着，适度走动促进恢复；②饮食营养均衡，多喝汤水有助下奶；③注意个人卫生，可洗澡洗头（注意保暖）；④禁止性生活（产后42天内）；⑤产后42天检查：子宫恢复、盆底、伤口愈合。留意宝宝第一次：第一次哭、第一次吸吮、第一次排便。",
        "tips": "产后情绪低落很常见，如持续两周以上需警惕产后抑郁，及时寻求帮助。",
        "is_essential": True, "sort_order": 2,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 40, "category": "food",
        "title": "产后饮食指南", "subtitle": "孕40周·营养重点",
        "content": "产后饮食分阶段：第1周清淡为主（小米粥、蛋羹、蔬菜汤），不宜大补；第2周开始增加营养（鱼汤、鸡汤、猪蹄汤）；第3-4周适度进补（红枣、枸杞、阿胶）。哺乳妈妈每天需额外增加500大卡，多喝汤水。避免回奶食物：韭菜、麦芽、山楂。",
        "tips": "月子餐不是越油越好，过于油腻容易造成堵奶。",
        "is_essential": False, "sort_order": 3,
    },
    {
        "stage_type": "pregnancy_week", "stage_value": 40, "category": "education",
        "title": "最后的胎教：出生后的延续", "subtitle": "孕40周·胎教建议",
        "content": "胎教不会因为分娩而终止——出生后0-3岁是早期教育的黄金期。出生后继续做：皮肤接触（袋鼠护理）、母乳喂养、温柔对话、读绘本、抚触按摩。宝宝在子宫里记住的声音（妈妈心跳、常听的音乐）在出生后能安抚他。准备好迎接一个全新的育儿旅程吧！",
        "tips": "宝宝出生后第一小时内进行肌肤接触和早吸吮，是最好的\"出生胎教\"。",
        "is_essential": False, "sort_order": 4,
    },
]


class Command(BaseCommand):
    help = "导入怀孕40周结构化时间轴数据"

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true", help="先清除已有的孕期周数据")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["clear"]:
            deleted, _ = TimelineEvent.objects.filter(stage_type="pregnancy_week").delete()
            self.stdout.write(self.style.WARNING(f"已清除 {deleted} 条旧孕期周数据"))

        created_count = 0
        skipped_count = 0
        for item in WEEKLY_DATA:
            obj, created = TimelineEvent.objects.get_or_create(
                title=item["title"],
                defaults=item,
            )
            if created:
                created_count += 1
            else:
                skipped_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"完成：新增 {created_count} 条，跳过已存在 {skipped_count} 条，"
            f"共 {TimelineEvent.objects.filter(stage_type='pregnancy_week').count()} 条孕期周数据"
        ))
