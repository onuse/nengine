# Shadow Heir Campaign - Design Document

## What We've Built

A **noir heist campaign** that turns Faerun into a thief's playground while maintaining D&D 5e mechanics.

---

## Core Concept

**"Ocean's Eleven meets Faerun"** - You inherit your mentor's legacy as master thief, along with a mysterious crystal that makes you hunted by **Shadow Thieves**, **Zhentarim**, and **Harpers**. Escape Baldur's Gate, recruit a crew, and pull off heists across the iconic cities of Faerun while uncovering the truth about your mentor's secret life.

---

## What Makes This Different

### **1. Opening That Hooks Immediately**
Not "you've been hired to escort a wagon." Instead:

> Your mentor dies in your arms at a celebration. She gives you a crystal. Your rival draws his blade. Thirty thieves stare. The real killer smiles. **What do you do?**

- Immediate emotional stakes (grief)
- Immediate physical danger (30 armed thieves)
- Immediate mystery (what is this crystal?)
- Multiple escape routes (fight/talk/climb/leverage)

### **2. NPCs With Depth**

**Zara Nightwhisper** (Your Mentor):
- Public: Master thief
- Secret: Harper deep cover agent for 30 years
- Truth: Mission to recruit you became genuine love
- Her death: Reveals betrayal, inheritance, and lies

**Keth Shadowblade** (Your Rival):
- Loved Zara for 20 years
- She chose you as apprentice over him
- Now hunting you for "murdering" her
- Can become your greatest ally if you prove your innocence

**Vex the Viper** (The Real Killer):
- Zhentarim infiltrator
- Poisoned Zara when she discovered him
- Framing you perfectly
- Always has an escape plan

### **3. Thief-Focused Gameplay**

**Combat = Failure**. Success is:
- Social engineering (bluff, charm, manipulate)
- Stealth and infiltration
- Reading people and situations
- Planning heists with recruited crew
- Multiple solutions to every problem

### **4. Faerun as Tourist Attraction + Heist Targets**

Each iconic location becomes:
- **Baldur's Gate**: Escape the city while hunted
- **Candlekeep**: Break in to decrypt the Harper crystal
- **Waterdeep**: Political espionage and finding "Gray Hand"
- **Luskan**: Infiltrate pirate lords to expose Zhentarim
- **Neverwinter**: Frame corrupt nobles

You're not just visiting - you're **working** these cities.

---

## Campaign Structure

### **Act 1: Baldur's Gate - The Murder and the Flight**

**Opening**: [shadow_guild_celebration](games/shadow-heir-campaign/content/world.yaml:24)
- Zara dies, you're framed
- 30 seconds to escape or die
- Multiple paths out

**Baldur's Gate Locations Created:**
- **Elfsong Tavern** (murder scene + exterior wall climb)
- **Dark Alleys** (chase through Lower City)
- **Gray Harbor Docks** (ship escape option)
- **Lower City Backstreets** (labyrinth navigation)
- **Blushing Mermaid** (neutral ground, information hub)
- **Counting House** (optional heist for your hidden gold)
- **Sewers** (underground escape route)
- **Ancient Tunnels** (Harper revelation moment)

**Goals**:
1. Escape the city alive
2. Understand what the crystal is
3. Discover Zara was Harper
4. Recruit first crew member
5. Get passage north to Waterdeep

### **Act 2: The Journey North** (To Be Built)
- Candlekeep library heist
- Recruit crew members
- Learn full truth about Harpers vs Zhentarim
- Choose: work with Harpers or go independent

### **Act 3: Waterdeep - The Gray Hand** (To Be Built)
- Find the Harper contact
- Political intrigue heist
- Confront Keth (potential ally)
- Expose Vex's Zhentarim connections

### **Act 4: Final Heist** (To Be Built)
- Luskan or Zhentil Keep
- Take down Manshoon's operation
- Multiple endings based on choices

---

## Game Mechanics Implemented

### **LLM-Enhanced Gameplay** ([game.yaml:259-305](games/shadow-heir-campaign/game.yaml))

**Tone**: Noir-heist, dark and atmospheric
**Focus**: Social dynamics, body language, multiple approaches
**Philosophy**: Information is treasure, combat is failure

### **Heist Mechanics** ([game.yaml:209-213](games/shadow-heir-campaign/game.yaml))
- Planning phase
- Recruit crew
- Reputation system (actions affect how factions view you)

### **Expanded Commands** ([game.yaml:215-222](games/shadow-heir-campaign/game.yaml))
- Stealth category: hide, sneak, disguise, forge, eavesdrop
- Social: bribe, threaten, charm, bluff
- Thief skills: pickpocket, disarm, case, tail

### **Primary Skills** ([game.yaml:200-207](games/shadow-heir-campaign/game.yaml))
- Stealth, Deception, Persuasion (social engineering)
- Sleight of Hand, Investigation, Insight (thief core)
- Perception (survival skill)

---

## What's Been Created

### **Files Modified:**

1. **games/shadow-heir-campaign/game.yaml**
   - Title and description
   - Noir thief theme
   - Heist mechanics
   - LLM instructions for social-focused gameplay
   - Expanded command set

2. **games/shadow-heir-campaign/content/world.yaml**
   - Complete Baldur's Gate opening sequence
   - 10+ richly detailed locations
   - Multiple escape routes from opening
   - Atmospheric descriptions
   - Skill check opportunities
   - Hidden features and revelations

3. **games/shadow-heir-campaign/content/npcs.yaml** (Started)
   - Header changed to Shadow Heir style
   - Core NPCs defined (Zara, Keth, Vex)
   - Needs: Full NPC roster completion

---

## What Still Needs Building

### **Immediate (Act 1 Complete)**:
1. **Finish NPCs file** with:
   - Grimjaw (Blushing Mermaid barkeep)
   - Shadow's Dozen (guild members at murder scene)
   - Potential crew recruits in Baldur's Gate
   - City Watch, Flaming Fist
   - Harper contacts

2. **Add more Baldur's Gate locations**:
   - Upper City (for contrast)
   - Flaming Fist garrison
   - Black-sailed ship option
   - Harper safe house interior
   - Zara's hidden apartment (clue location)

3. **Items and gear** specific to thieves:
   - Lockpicks, smoke bombs, disguise kits
   - The crystal (Harper communication device)
   - Zara's belongings (clues)

### **Medium Term (Act 2)**:
4. **Road to Waterdeep** locations
5. **Candlekeep** heist design
6. **Crew recruitment** system
7. **Reputation** tracking with factions

### **Long Term (Acts 3-4)**:
8. **Waterdeep** in detail
9. **Final heist** locations
10. **Multiple endings**

---

## Design Principles Followed

### **1. Every NPC Has Layers**
- Public persona vs private truth
- Secrets that unfold through interaction
- Relationships with other NPCs (webs, not lists)
- Can be manipulated, bribed, turned

### **2. Locations Are Playable**
- Not just "you're in Baldur's Gate"
- But "you're in the Blushing Mermaid, Grimjaw eyes you, hooded figure signals, Vex's spy watches from corner"
- Multiple exits, hiding places, NPCs, opportunities
- Atmosphere (lighting, sounds, mood) in every description

### **3. Player Agency Paramount**
- Never "you do X"
- Always "X happens, what do you do?"
- Multiple solutions to every problem
- Consequences for being seen, heard, remembered

### **4. Thief Over Warrior**
- Prefer stealth, talk, misdirection
- Combat means something went wrong
- Information gathering is core gameplay
- Social engineering > dice rolling

### **5. Faerun Lore as Flavor**
- Name-drop locations naturally
- Iconic NPCs as complications (not just cameos)
- Use established factions (Harpers, Zhentarim, Shadow Thieves)
- Make tourist sites into heist targets

---

## How To Continue Development

### **Priority 1: Complete Act 1**
Focus on making Baldur's Gate escape fully playable before expanding.

### **Priority 2: Test the Opening**
The murder scene is the hook - it needs to be perfect:
- Multiple escape paths work
- NPCs react dynamically
- Crystal mystery is compelling
- Emotional impact lands

### **Priority 3: Build Outward**
Once Act 1 works, expand north along the Sword Coast.

---

## Key Selling Points

1. **Immediate stakes** - no slow buildup
2. **Complex NPCs** - every character has secrets
3. **Thief focus** - talk and sneak > fight
4. **Faerun tour** - iconic locations as heist targets
5. **Personal story** - mentor's death, inherited legacy, truth about your life
6. **Multiple solutions** - LLM enables creative problem-solving
7. **Crew building** - recruit your Ocean's Eleven
8. **Faction play** - Harpers vs Zhentarim vs Shadow Thieves

---

## Technical Notes

- **Keeps D&D 5e mechanics** - skills, spells, combat still work
- **Maintains existing content** - monsters, items, spells from original
- **LLM-optimized** - focuses on description and choice over dice rolls
- **Git-based saves** - supports timeline branching for heists gone wrong

---

## The Vision

A campaign where you:
- **Start** running for your life with a mysterious crystal
- **Discover** your mentor was a spy and your life was a lie
- **Build** a crew of talented thieves
- **Pull heists** across the greatest cities of Faerun
- **Choose** between factions (Harpers, Zhentarim, or independent)
- **End** taking down your mentor's killers in an epic final heist

All while experiencing Faerun's iconic locations not as a tourist, but as a master thief with a target on your back.
